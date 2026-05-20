/**
 * Error Types
 *
 * Specific error classes for domain-specific error handling.
 * Follows the principle of "specific errors over generic errors".
 *
 * @module types/errors
 */

/**
 * Base error class for all valuation-related errors
 */
export type ValuationErrorContext = Record<string, unknown>

export class ValuationError extends Error {
  /**
   * Error code for programmatic handling
   */
  public readonly code: string

  /**
   * Whether the error is recoverable (user can retry)
   */
  public readonly recoverable: boolean

  /**
   * Additional context about the error
   */
  public readonly context?: ValuationErrorContext

  constructor(
    message: string,
    code: string,
    recoverable: boolean = true,
    context?: ValuationErrorContext
  ) {
    super(message)
    this.name = 'ValuationError'
    this.code = code
    this.recoverable = recoverable
    this.context = context

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValuationError)
    }
  }
}

/**
 * Error thrown when session restoration fails
 */
export class SessionRestorationError extends ValuationError {
  constructor(message: string, context?: ValuationErrorContext) {
    super(message, 'SESSION_RESTORATION_ERROR', true, context)
    this.name = 'SessionRestorationError'
  }
}

/**
 * Error thrown when report generation fails
 */
export class ReportGenerationError extends ValuationError {
  constructor(message: string, recoverable: boolean = true, context?: ValuationErrorContext) {
    super(message, 'REPORT_GENERATION_ERROR', recoverable, context)
    this.name = 'ReportGenerationError'
  }
}

/**
 * Error thrown when API calls fail
 */
export class APIError extends ValuationError {
  public readonly statusCode?: number
  public readonly endpoint?: string

  constructor(
    message: string,
    statusCode?: number,
    endpoint?: string,
    recoverable: boolean = true,
    context?: ValuationErrorContext
  ) {
    super(message, 'API_ERROR', recoverable, context)
    this.name = 'APIError'
    this.statusCode = statusCode
    this.endpoint = endpoint
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends ValuationError {
  public readonly field?: string
  public readonly value?: unknown

  constructor(message: string, field?: string, value?: unknown, context?: ValuationErrorContext) {
    super(message, 'VALIDATION_ERROR', true, context)
    this.name = 'ValidationError'
    this.field = field
    this.value = value
  }
}

/**
 * Error thrown when credit check fails
 */
export class CreditError extends ValuationError {
  public readonly creditsRemaining: number

  constructor(message: string, creditsRemaining: number = 0) {
    super(message, 'CREDIT_ERROR', false, { creditsRemaining })
    this.name = 'CreditError'
    this.creditsRemaining = creditsRemaining
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends ValuationError {
  constructor(message: string, context?: ValuationErrorContext) {
    super(message, 'AUTHENTICATION_ERROR', false, context)
    this.name = 'AuthenticationError'
  }
}

/**
 * Error thrown when rate limiting is hit
 */
export class RateLimitError extends ValuationError {
  public readonly retryAfter?: number

  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', true, { retryAfter })
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

/**
 * Error thrown when network connectivity fails
 */
export class NetworkError extends ValuationError {
  public readonly retryable: boolean

  constructor(message: string, retryable: boolean = true, context?: ValuationErrorContext) {
    super(message, 'NETWORK_ERROR', retryable, { ...context, retryable })
    this.name = 'NetworkError'
    this.retryable = retryable
  }
}

/**
 * Error thrown when conversation state is invalid
 */
export class ConversationStateError extends ValuationError {
  constructor(message: string, context?: ValuationErrorContext) {
    super(message, 'CONVERSATION_STATE_ERROR', true, context)
    this.name = 'ConversationStateError'
  }
}

/**
 * Error thrown when calculation fails (500 errors)
 */
export class CalculationError extends ValuationError {
  public readonly reportId?: string

  constructor(message: string, reportId?: string, context?: ValuationErrorContext) {
    super(message, 'CALCULATION_ERROR', true, { ...context, reportId })
    this.name = 'CalculationError'
    this.reportId = reportId
  }
}

/**
 * Error thrown when a resource is not found (404 errors)
 */
export class NotFoundError extends ValuationError {
  public readonly resourceType?: string
  public readonly resourceId?: string

  constructor(
    message: string,
    resourceType?: string,
    resourceId?: string,
    context?: ValuationErrorContext
  ) {
    super(message, 'NOT_FOUND_ERROR', false, { ...context, resourceType, resourceId })
    this.name = 'NotFoundError'
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

/**
 * Generic application error for unexpected failures
 */
export class ApplicationError extends ValuationError {
  constructor(message: string, code: string, context?: ValuationErrorContext) {
    super(message, code, true, context)
    this.name = 'ApplicationError'
  }
}

/**
 * Type guard to check if error is a ValuationError
 */
export function isValuationError(error: unknown): error is ValuationError {
  return error instanceof ValuationError
}

/**
 * Type guard to check if error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (isValuationError(error)) {
    return error.recoverable
  }
  return false
}

/**
 * Extract user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (isValuationError(error)) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred. Please try again.'
}
