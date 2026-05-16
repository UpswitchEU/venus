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
import { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

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
const VALUATION_TIMEOUT_MS = 120000 // 120 seconds for complex calculations

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

function extractValidationMessage(responseData: any, fallback: string): string {
  const explicitMessage =
    typeof responseData?.message === 'string'
      ? responseData.message
      : typeof responseData?.error === 'string'
        ? responseData.error
        : null

  const issues = extractValidationIssues(responseData?.errors)
  const issueSummary =
    issues.length > 0
      ? issues
          .map((issue) => (issue.field ? `${issue.field}: ${issue.message}` : issue.message))
          .join('; ')
      : null

  return explicitMessage || issueSummary || fallback
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
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: {
            ...data,
            dataSource: 'manual',
          },
          headers: {},
        } as any,
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // /calculate is non-idempotent (consumes credits, renders report).
          // Retrying on 503/network amplifies load and log noise; ValuationIQ
          // now ships a safety-net report so a 503 here is genuinely a hard
          // failure worth surfacing once, not masking with 2–3 silent retries.
          retry: {
            maxRetries: 0,
            initialDelay: 0,
            ...options?.retry,
          },
        }
      )
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
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: {
            ...data,
            dataSource: 'ai-guided',
          },
          headers: {},
        } as any,
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // See calculateManualValuation() — same /calculate endpoint, same
          // non-idempotent contract, same no-retry policy.
          retry: {
            maxRetries: 0,
            initialDelay: 0,
            ...options?.retry,
          },
        }
      )
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
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: {
            ...data,
            dataSource: 'instant',
          },
          headers: {},
        } as any,
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // See calculateManualValuation() — same /calculate endpoint, same
          // non-idempotent contract, same no-retry policy.
          retry: {
            maxRetries: 0,
            initialDelay: 0,
            ...options?.retry,
          },
        }
      )
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
      const dataSource =
        (data as any).dataSource === 'conversational'
          ? 'ai-guided'
          : (data as any).dataSource || 'manual'
      const backendData = {
        ...data,
        dataSource,
      } as any

      // Use unified endpoint - backend determines credit cost based on dataSource
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: backendData,
          headers: {},
        } as any,
        {
          ...options,
          timeout: options?.timeout ?? VALUATION_TIMEOUT_MS, // 120s for valuations
          // See calculateManualValuation() — calculate is non-idempotent,
          // don't retry. ValuationIQ guarantees a response (with safety-net
          // report when templating fails); a 503 here means the caller
          // should surface the issue, not spawn a retry storm.
          retry: {
            maxRetries: 0,
            initialDelay: 0,
            ...options?.retry,
          },
        }
      )
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
        } as any,
        options
      )
    } catch (error) {
      apiLogger.error('Failed to generate preview HTML', { error })
      const axiosError = error as any
      const statusCode = axiosError?.response?.status
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
        } as any,
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

    const axiosError = error as any
    const status = axiosError?.response?.status
    const responseData = axiosError?.response?.data

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
      const field =
        typeof responseData?.field === 'string'
          ? responseData.field
          : extractValidationIssues(responseData?.errors)[0]?.field

      const nestedMsg = responseData?.message
      const codeFromBody =
        typeof nestedMsg === 'object' && nestedMsg !== null && 'code' in nestedMsg
          ? (nestedMsg as { code?: string }).code
          : responseData?.code

      throw new ValidationError(message, field, undefined, {
        status,
        code: codeFromBody,
        hint: responseData?.hint,
        errors: responseData?.errors,
      })
    }

    if (
      axiosError?.code === 'ECONNABORTED' ||
      axiosError?.code === 'ENOTFOUND' ||
      axiosError?.code === 'ECONNREFUSED' ||
      axiosError?.code === 'ECONNRESET' ||
      status === 503
    ) {
      throw new NetworkError('Service temporarily unavailable. Please try again in a moment.')
    }

    throw new APIError(`Failed to complete ${operation}`, status, undefined, true, {
      originalError: error,
    })
  }
}
