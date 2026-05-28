/**
 * Report API Service
 *
 * Single Responsibility: Handle all report CRUD operations and downloads
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/report/ReportAPI
 */

import {
  BY_SESSION_404_BACKOFF_MS,
  buildAxiosEffectiveRequestUrl,
  isBySessionReportUrl,
} from '../../../constants/reportBySessionRetry'
import { APIError, AuthenticationError, NetworkError } from '../../../types/errors'
import { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import { normalizeValuationResultEnvelope } from '../../../utils/resolveAcademicValidationIssues'
import { apiLogger } from '../../../utils/logger'
import { createRandomId } from '../../../utils/secureRandom'
import { APIRequestConfig, HttpClient } from '../HttpClient'

type AxiosLikeError = {
  code?: string
  config?: {
    baseURL?: string
    method?: string
    url?: string
  }
  name?: string
  response?: {
    data?: unknown
    status?: number
    statusText?: string
  }
}

function asAxiosLikeError(error: unknown): AxiosLikeError {
  return error && typeof error === 'object' ? (error as AxiosLikeError) : {}
}

async function parsePlanGateErrorMessage(axiosError: {
  response?: { data?: unknown }
}): Promise<string> {
  const fallback =
    'PDF download requires a plan that includes downloadable reports. Upgrade to Starter to continue.'
  const data = axiosError.response?.data
  if (data && typeof data === 'object' && !(data instanceof Blob)) {
    const o = data as { message?: string; error?: string }
    return o.message || o.error || fallback
  }
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      const j = JSON.parse(text) as { message?: string; error?: string }
      return j.message || j.error || fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

export class ReportAPI extends HttpClient {
  /**
   * Get valuation report by ID
   */
  async getReport(reportId: string, options?: APIRequestConfig): Promise<ValuationResponse> {
    const isBySession = isSessionKey(reportId)
    const url = isBySession
      ? `/api/v2/valuations/reports/by-session/${reportId}`
      : `/api/v2/valuations/reports/${reportId}`

    const { bySession404Attempts: session404Cap, ...executeOpts } = options ?? {}
    const requestOptions: APIRequestConfig = {
      ...executeOpts,
      retry: { ...executeOpts?.retry, maxRetries: 0 },
    }

    const defaultSessionAttempts = BY_SESSION_404_BACKOFF_MS.length
    const maxAttempts = isBySession
      ? Math.min(
          defaultSessionAttempts,
          Math.max(1, typeof session404Cap === 'number' ? session404Cap : defaultSessionAttempts)
        )
      : 1
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, BY_SESSION_404_BACKOFF_MS[attempt]))
      }
      try {
        const response = await this.executeRequest<ValuationResponse>(
          {
            method: 'GET',
            url,
            headers: {},
          },
          requestOptions
        )
        return normalizeValuationResultEnvelope(response)
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (isBySession && status === 404 && attempt < maxAttempts - 1) {
          // Short-circuit: Titan tags by-session 404s with
          // ``transient: false`` when the report is deleted, soft-
          // deleted, access-denied, or the session row doesn't exist.
          // Retrying can't help; without this the cascade wastes ~6.9s
          // (sum of BY_SESSION_404_BACKOFF_MS) per navigation to a
          // deleted/never-existed report.
          const body = (error as { response?: { data?: unknown } })?.response?.data
          if (
            body &&
            typeof body === 'object' &&
            'transient' in body &&
            (body as { transient?: unknown }).transient === false
          ) {
            apiLogger.debug('Report by-session permanently unavailable, skipping retries', {
              reportId,
              attempt,
              reason: (body as { reason?: unknown }).reason,
            })
            this.handleReportError(error, 'get report')
          }
          apiLogger.debug('Report by-session not ready yet, retrying', { reportId, attempt })
          continue
        }
        this.handleReportError(error, 'get report')
      }
    }
    throw new Error('Unreachable: getReport exhausted retries without response')
  }

  /**
   * Best-effort: ask Titan to render/persist report HTML (self-heal when numbers exist but HTML is missing).
   * Accepts canonical report UUIDs and session keys (val_*).
   */
  async ensureReportHtml(
    reportId: string,
    options?: { sync?: boolean; sessionKey?: string; alternateReportId?: string }
  ): Promise<Record<string, unknown> | null> {
    if (!isUuid(reportId) && !isSessionKey(reportId)) {
      return null
    }
    try {
      const trimmedSk = typeof options?.sessionKey === 'string' ? options.sessionKey.trim() : ''
      const safeSessionKey =
        trimmedSk && isSessionKey(trimmedSk) && trimmedSk !== reportId ? trimmedSk : undefined
      const trimmedAlt =
        typeof options?.alternateReportId === 'string' ? options.alternateReportId.trim() : ''
      const safeAlternate =
        trimmedAlt && isUuid(trimmedAlt) && trimmedAlt !== reportId ? trimmedAlt : undefined

      return await this.executeRequest<Record<string, unknown>>(
        {
          method: 'POST',
          url: `/api/v2/valuations/reports/${encodeURIComponent(reportId)}/ensure-html`,
          data: {
            sync: options?.sync !== false,
            ...(safeSessionKey ? { sessionKey: safeSessionKey } : {}),
            ...(safeAlternate ? { alternateReportId: safeAlternate } : {}),
          },
          headers: {},
        },
        { timeout: 60_000 }
      )
    } catch (error) {
      apiLogger.warn('ensureReportHtml request failed', { reportId, error })
      return null
    }
  }

  /**
   * Update valuation report
   */
  async updateReport(
    reportId: string,
    data: Partial<ValuationRequest>,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      const response = await this.executeRequest<ValuationResponse>(
        {
          method: 'PUT',
          url: `/api/v2/valuations/reports/${reportId}`,
          data,
          headers: {},
        },
        options
      )
      return normalizeValuationResultEnvelope(response)
    } catch (error) {
      this.handleReportError(error, 'update report')
    }
  }

  /**
   * Delete valuation report
   * Idempotent: 404 (already deleted) is treated as success to handle race conditions and retries
   */
  async deleteReport(reportId: string, options?: APIRequestConfig): Promise<{ success: boolean }> {
    try {
      return await this.executeRequest<{ success: boolean }>(
        {
          method: 'DELETE',
          url: `/api/v2/valuations/reports/${reportId}`,
          headers: {},
        },
        options
      )
    } catch (error) {
      const axiosError = error as { response?: { status?: number } }
      // Idempotent: 404 = report already deleted (race: double-click, retry, or another tab)
      if (axiosError?.response?.status === 404) {
        apiLogger.warn('Report not found on delete (already deleted?) - treating as success', {
          reportId,
        })
        return { success: true }
      }
      this.handleReportError(error, 'delete report')
    }
  }

  /**
   * Download accountant view PDF
   */
  async downloadAccountantViewPDF(reportId: string, options?: APIRequestConfig): Promise<Blob> {
    const correlationId = createRandomId('pdf', 12)

    // Check for duplicate request
    if (this.activeRequests.has(correlationId)) {
      apiLogger.warn('Duplicate PDF download request detected, cancelling previous', {
        correlationId,
      })
      this.activeRequests.get(correlationId)?.abort()
    }

    // Create AbortController for this request
    const controller = new AbortController()
    this.activeRequests.set(correlationId, controller)

    // Use provided signal or create new one
    const signal = options?.signal || controller.signal
    const timeout = options?.timeout || 120000 // 2 minutes for PDF downloads

    // Set up timeout
    const timeoutId = setTimeout(() => {
      apiLogger.warn('PDF download timeout, aborting', { correlationId, timeout })
      controller.abort()
    }, timeout)
    this.requestTimeouts.set(correlationId, timeoutId)

    try {
      apiLogger.info('Starting PDF download', {
        correlationId,
        reportId,
        timeout,
      })

      // Call Node.js backend endpoint which proxies to Python engine
      const response = await this.client.request<Blob>({
        method: 'POST',
        url: `/api/v2/valuations/pdf/accountant-view`,
        data: { reportId },
        responseType: 'blob', // Important: request as blob for PDF
        signal,
        timeout,
      })

      const contentLength = response.data?.size || 0
      apiLogger.info('PDF download completed', {
        correlationId,
        reportId,
        contentLength,
        contentType: response.headers?.['content-type'],
      })

      // Validate PDF blob
      if (!response.data || response.data.size === 0) {
        throw new Error('Received empty PDF blob')
      }

      if (response.headers?.['content-type'] !== 'application/pdf') {
        apiLogger.warn('Unexpected content type for PDF download', {
          contentType: response.headers?.['content-type'],
          expected: 'application/pdf',
        })
      }

      return response.data
    } catch (error) {
      const axiosError = asAxiosLikeError(error)
      // Comprehensive error logging
      const errorContext = {
        correlationId,
        reportId,
        error: error instanceof Error ? error.message : String(error),
        status: axiosError?.response?.status,
        statusText: axiosError?.response?.statusText,
        isTimeout: axiosError?.code === 'ECONNABORTED',
        isAbort: axiosError?.name === 'AbortError',
      }

      if (axiosError?.response?.status === 404) {
        apiLogger.error('Report not found for PDF download', errorContext)
        throw new APIError('Report not found. Please check the report ID.', 404)
      }

      if (axiosError?.response?.status === 402) {
        const msg = await parsePlanGateErrorMessage(axiosError)
        const data = axiosError.response?.data
        const code =
          data && typeof data === 'object' && !(data instanceof Blob)
            ? (data as { code?: string }).code
            : undefined
        const inviteAdvisorRequired = code === 'INVITE_ADVISOR_REQUIRED'
        apiLogger.warn('PDF download blocked by plan', { ...errorContext, message: msg, code })
        throw new APIError(msg, 402, undefined, true, {
          upgradeRequired: !inviteAdvisorRequired,
          inviteAdvisorRequired,
          code,
        })
      }

      if (axiosError?.response?.status === 403 || axiosError?.response?.status === 401) {
        apiLogger.error('Unauthorized PDF download attempt', errorContext)
        throw new AuthenticationError('You do not have permission to download this report.')
      }

      if (axiosError?.code === 'ECONNABORTED') {
        apiLogger.error('PDF download timed out', errorContext)
        throw new NetworkError('PDF download timed out. Please try again.')
      }

      if (axiosError?.name === 'AbortError') {
        apiLogger.info('PDF download was cancelled', errorContext)
        throw error // Re-throw abort errors
      }

      // Log additional error context
      apiLogger.error('PDF download failed with unknown error', {
        ...errorContext,
        stack: error instanceof Error ? error.stack : undefined,
        responseData: axiosError?.response?.data,
      })

      const statusCode = axiosError?.response?.status
      throw new APIError('Failed to download PDF. Please try again.', statusCode, undefined, true, {
        originalError: error,
      })
    } finally {
      // Cleanup
      this.activeRequests.delete(correlationId)
      const timeout = this.requestTimeouts.get(correlationId)
      if (timeout) {
        clearTimeout(timeout)
        this.requestTimeouts.delete(correlationId)
      }
    }
  }

  /**
   * Handle report-specific errors
   */
  private handleReportError(error: unknown, operation: string): never {
    const axiosError = asAxiosLikeError(error)
    const status = axiosError?.response?.status
    const effectiveUrl = buildAxiosEffectiveRequestUrl(axiosError?.config)
    const isExpectedBySession404 = status === 404 && isBySessionReportUrl(effectiveUrl)

    if (status === 404) {
      if (isExpectedBySession404) {
        apiLogger.debug('Report by-session not available', {
          operation,
          status,
          url: effectiveUrl || axiosError?.config?.url,
        })
      } else {
        apiLogger.warn(`Report ${operation} not found`, { error })
      }
      throw new APIError('Report not found', status, undefined, true)
    }

    apiLogger.error(`Report ${operation} failed`, { error })

    if (status === 401 || status === 403) {
      throw new AuthenticationError('Authentication required for report operation')
    }

    if (axiosError?.code === 'ECONNABORTED' || axiosError?.code === 'ENOTFOUND') {
      throw new NetworkError('Network error during report operation')
    }

    throw new APIError(`Failed to ${operation}`, status, undefined, true, { originalError: error })
  }
}
