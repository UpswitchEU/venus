/**
 * Valuation API Service
 *
 * Single Responsibility: Handle all valuation calculation operations
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/valuation/ValuationAPI
 */

import {
  APIError,
  AuthenticationError,
  CreditError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../../../types/errors'
import type { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { apiLogger } from '../../../utils/logger'
import { normalizeValuationResultEnvelope } from '../../../utils/resolveAcademicValidationIssues'
import { APIRequestConfig, HttpClient } from '../HttpClient'
import { VALUATION_NO_RETRY, VALUATION_OPERATION_TIMEOUT_MS } from '../valuationTimeouts'

/**
 * BANK-GRADE TIMEOUT CHAIN
 *
 * Timeouts must be configured in decreasing order:
 * - Venus (Frontend) → 120s (longest, waits for Titan)
 * - Titan (API) → 100s (waits for ValuationIQ)
 * - ValuationIQ (Python) → 90s (shortest, actual calculation)
 *
 * This ensures proper timeout cascading:
 * - If ValuationIQ times out at 90s, Titan catches it
 * - If Titan times out at 100s, Venus catches it
 * - Venus never times out before backend completes
 */
const VALUATION_TIMEOUT_MS = VALUATION_OPERATION_TIMEOUT_MS
type UnknownRecord = Record<string, unknown>
type ValuationDataSource = 'manual' | 'ai-guided' | 'instant'
type ValuationCalculateRequest = ValuationRequest & { dataSource: ValuationDataSource }

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toCalculateRequest(
  data: ValuationRequest,
  dataSource: ValuationDataSource
): ValuationCalculateRequest {
  return {
    ...data,
    dataSource,
  }
}

function normalizeValuationDataSource(data: ValuationRequest): ValuationDataSource {
  const requested = (data as ValuationRequest & { dataSource?: unknown }).dataSource
  if (requested === 'conversational' || requested === 'ai-guided') {
    return 'ai-guided'
  }
  if (requested === 'instant') {
    return 'instant'
  }
  return 'manual'
}

function getErrorResponse(error: unknown): { status?: number; data?: unknown; code?: string } {
  const errorRecord = asRecord(error)
  const response = asRecord(errorRecord?.response)
  const status = typeof response?.status === 'number' ? response.status : undefined

  return {
    status,
    data: response?.data,
    code: asString(errorRecord?.code) ?? undefined,
  }
}

function extractValidationIssues(errors: unknown): Array<{ field?: string; message: string }> {
  if (!Array.isArray(errors)) {
    return []
  }

  return errors
    .map((issue) => {
      if (typeof issue === 'string') {
        return { message: issue }
      }

      if (issue && typeof issue === 'object') {
        const typedIssue = issue as Record<string, unknown>
        const message =
          typeof typedIssue.message === 'string'
            ? typedIssue.message
            : typeof typedIssue.msg === 'string'
              ? typedIssue.msg
              : null

        if (!message) {
          return null
        }

        const field =
          typeof typedIssue.field === 'string'
            ? typedIssue.field
            : Array.isArray(typedIssue.loc)
              ? typedIssue.loc.join('.')
              : undefined

        return { field, message }
      }

      return null
    })
    .filter((issue): issue is { field?: string; message: string } => issue !== null)
}

function extractValidationMessage(responseData: unknown, fallback: string): string {
  const response = asRecord(responseData)
  const explicitMessage = asString(response?.message) ?? asString(response?.error) ?? null

  const issues = extractValidationIssues(response?.errors)
  const issueSummary =
    issues.length > 0
      ? issues
          .map((issue) => (issue.field ? `${issue.field}: ${issue.message}` : issue.message))
          .join('; ')
      : null

  return explicitMessage || issueSummary || fallback
}

function finalizeValuationCalculateResponse(response: ValuationResponse): ValuationResponse {
  return normalizeValuationResultEnvelope(response)
}

export class ValuationAPI extends HttpClient {
  /**
   * Calculate manual valuation (traditional form-based)
   * Uses unified /api/valuations/calculate endpoint with dataSource='manual'
   */
  async calculateManualValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      const response = await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: toCalculateRequest(data, 'manual'),
          headers: {},
        },
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // /calculate is non-idempotent (consumes credits, renders report).
          // Retrying on 503/network amplifies load and log noise; ValuationIQ
          // now ships a safety-net report so a 503 here is genuinely a hard
          // failure worth surfacing once, not masking with 2–3 silent retries.
          retry: { ...options?.retry, ...VALUATION_NO_RETRY },
        }
      )
      return finalizeValuationCalculateResponse(response)
    } catch (error) {
      this.handleValuationError(error, 'manual valuation')
    }
  }

  /**
   * Calculate AI-guided valuation (conversational flow)
   * Uses unified /api/valuations/calculate endpoint with dataSource='ai-guided'
   */
  async calculateAIGuidedValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      const response = await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: toCalculateRequest(data, 'ai-guided'),
          headers: {},
        },
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // See calculateManualValuation() — same /calculate endpoint, same
          // non-idempotent contract, same no-retry policy.
          retry: { ...options?.retry, ...VALUATION_NO_RETRY },
        }
      )
      return finalizeValuationCalculateResponse(response)
    } catch (error) {
      this.handleValuationError(error, 'AI-guided valuation')
    }
  }

  /**
   * Calculate instant valuation (quick preview)
   * Uses unified /api/valuations/calculate endpoint with dataSource='instant'
   */
  async calculateInstantValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      const response = await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: toCalculateRequest(data, 'instant'),
          headers: {},
        },
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // See calculateManualValuation() — same /calculate endpoint, same
          // non-idempotent contract, same no-retry policy.
          retry: { ...options?.retry, ...VALUATION_NO_RETRY },
        }
      )
      return finalizeValuationCalculateResponse(response)
    } catch (error) {
      this.handleValuationError(error, 'instant valuation')
    }
  }

  /**
   * Unified valuation calculation (determines type automatically)
   */
  async calculateValuationUnified(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      // Map frontend 'conversational' to backend 'ai-guided'
      // Note: dataSource is not part of ValuationRequest type, so we add it to the request data
      const dataSource = normalizeValuationDataSource(data)
      const backendData = toCalculateRequest(data, dataSource)

      // Use unified endpoint - backend determines credit cost based on dataSource
      const response = await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: backendData,
          headers: {},
        },
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // See calculateManualValuation() — calculate is non-idempotent,
          // don't retry. ValuationIQ guarantees a response (with safety-net
          // report when templating fails); a 503 here means the caller
          // should surface the issue, not spawn a retry storm.
          retry: { ...options?.retry, ...VALUATION_NO_RETRY },
        }
      )
      return finalizeValuationCalculateResponse(response)
    } catch (error) {
      this.handleValuationError(error, 'unified valuation')
    }
  }

  /**
   * Generate HTML preview for valuation
   */
  async generatePreviewHtml(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<{ html: string; completeness_percent: number }> {
    try {
      return await this.executeRequest<{ html: string; completeness_percent: number }>(
        {
          method: 'POST',
          url: '/api/v2/valuations/preview-html',
          data,
          headers: {},
        },
        options
      )
    } catch (error) {
      apiLogger.error('Failed to generate preview HTML', { error })
      const { status: statusCode } = getErrorResponse(error)
      throw new APIError('Failed to generate valuation preview', statusCode, undefined, true, {
        originalError: error,
      })
    }
  }

  /**
   * Omni-Calc: Persist the accountant's selected valuation method and re-render
   * the HTML report. Returns the new html_report when the backend successfully
   * re-renders, allowing the preview to update immediately.
   */
  async updateSelectedMethod(
    reportId: string,
    selectedMethod: string,
    overrideReason?: string,
    overrideNote?: string,
    options?: {
      preparer_ev_ebitda_median?: number
      preparer_ev_ebitda_override?: {
        reason_key: string
        note?: string
        acknowledged_extreme?: boolean
      }
      clear_preparer_override?: boolean
    }
  ): Promise<{ selected_method: string; html_report?: string }> {
    try {
      return await this.executeRequest<{ selected_method: string; html_report?: string }>(
        {
          method: 'PATCH',
          url: `/api/v2/valuations/reports/${reportId}/method`,
          data: {
            selected_method: selectedMethod,
            ...(overrideReason ? { override_reason: overrideReason } : {}),
            ...(overrideNote ? { override_note: overrideNote } : {}),
            ...(options?.preparer_ev_ebitda_median != null
              ? { preparer_ev_ebitda_median: options.preparer_ev_ebitda_median }
              : {}),
            ...(options?.preparer_ev_ebitda_override
              ? { preparer_ev_ebitda_override: options.preparer_ev_ebitda_override }
              : {}),
            ...(options?.clear_preparer_override ? { clear_preparer_override: true } : {}),
          },
          headers: {},
        },
        { timeout: 30_000 }
      )
    } catch (error) {
      apiLogger.warn('Failed to persist selected method (non-critical)', {
        reportId,
        selectedMethod,
        error,
      })
      throw error
    }
  }

  /**
   * Handle valuation-specific errors with appropriate error types
   */
  private handleValuationError(error: unknown, operation: string): never {
    apiLogger.error(`Valuation ${operation} failed`, { error })

    const { status, data: responseData, code } = getErrorResponse(error)
    const response = asRecord(responseData)

    if (status === 429) {
      throw new RateLimitError('Too many valuation requests. Please wait before trying again.')
    }

    if (status === 401 || status === 403) {
      throw new AuthenticationError('Authentication required for valuation calculation.')
    }

    if (status === 402) {
      throw new CreditError('Insufficient credits for valuation calculation.')
    }

    if (status === 400 || status === 422) {
      const message = extractValidationMessage(responseData, 'Invalid valuation data provided.')
      const field = asString(response?.field) ?? extractValidationIssues(response?.errors)[0]?.field

      const nestedMsg = response?.message
      const nestedMsgRecord = asRecord(nestedMsg)
      const codeFromBody = asString(nestedMsgRecord?.code) ?? asString(response?.code)

      throw new ValidationError(message, field, undefined, {
        status,
        code: codeFromBody,
        hint: response?.hint,
        errors: response?.errors,
      })
    }

    if (
      code === 'ECONNABORTED' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      status === 503
    ) {
      throw new NetworkError('Service temporarily unavailable. Please try again in a moment.')
    }

    throw new APIError(`Failed to complete ${operation}`, status, undefined, true, {
      originalError: error,
    })
  }
}
