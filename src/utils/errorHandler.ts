/**
 * Centralized Error Handler
 * Provides consistent error handling, classification, and user-friendly messages
 */

export enum ErrorType {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  SERVER = 'server',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

export interface ErrorInfo {
  type: ErrorType
  message: string
  userMessage: string
  retryable: boolean
  statusCode?: number
  originalError?: Error
}

type TransportError = Error & {
  config?: {
    data?: unknown
    method?: string
    url?: string
  }
  response?: {
    data?: unknown
    status?: number
  }
}

function asTransportError(error: unknown): TransportError | null {
  return error instanceof Error ? (error as TransportError) : null
}

/**
 * Classify error type
 */
export function classifyError(error: unknown): ErrorType {
  if (!(error instanceof Error)) {
    return ErrorType.UNKNOWN
  }

  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  // Network errors
  if (
    name === 'networkerror' ||
    (name === 'typeerror' && message.includes('fetch')) ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  ) {
    return ErrorType.NETWORK
  }

  // Timeout errors
  if (
    name === 'timeouterror' ||
    (name === 'aborterror' && message.includes('timeout')) ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return ErrorType.TIMEOUT
  }

  // Cancelled errors
  if (
    name === 'aborterror' ||
    name === 'cancelerror' ||
    message.includes('cancelled') ||
    message.includes('aborted')
  ) {
    return ErrorType.CANCELLED
  }

  // Validation errors (check for status code)
  const transportError = asTransportError(error)
  const status = transportError?.response?.status
  if (status !== undefined && status >= 400 && status < 500) {
    return ErrorType.VALIDATION
  }

  // Server errors
  if (status !== undefined && status >= 500) {
    return ErrorType.SERVER
  }

  return ErrorType.UNKNOWN
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  const type = classifyError(error)
  const transportError = asTransportError(error)

  switch (type) {
    case ErrorType.NETWORK:
      return 'Connection error. Please check your internet connection and try again.'

    case ErrorType.TIMEOUT:
      return 'Request timed out. The calculation is taking longer than expected. Please try again.'

    case ErrorType.VALIDATION: {
      const responseData = transportError?.response?.data
      const validationMessage =
        responseData && typeof responseData === 'object'
          ? ((responseData as { error?: string; message?: string }).error ??
            (responseData as { error?: string; message?: string }).message)
          : undefined
      if (validationMessage) {
        return `Validation error: ${validationMessage}`
      }
      return 'Invalid data provided. Please check your inputs and try again.'
    }

    case ErrorType.SERVER:
      return 'Server error occurred. Our team has been notified. Please try again in a moment.'

    case ErrorType.CANCELLED:
      return 'Request was cancelled.'

    default:
      return 'An unexpected error occurred. Please try again.'
  }
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  const type = classifyError(error)

  return type === ErrorType.NETWORK || type === ErrorType.TIMEOUT || type === ErrorType.SERVER
}

/**
 * Extract error information
 */
export function extractErrorInfo(error: unknown): ErrorInfo {
  const type = classifyError(error)
  const transportError = asTransportError(error)
  const originalError = error instanceof Error ? error : new Error(String(error))

  return {
    type,
    message: originalError.message,
    userMessage: getUserFriendlyMessage(error),
    retryable: isRetryable(error),
    statusCode: transportError?.response?.status,
    originalError: originalError,
  }
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: unknown): Record<string, unknown> {
  const info = extractErrorInfo(error)
  const transportError = asTransportError(error)

  return {
    type: info.type,
    message: info.message,
    userMessage: info.userMessage,
    retryable: info.retryable,
    statusCode: info.statusCode,
    stack: info.originalError?.stack,
    response: transportError?.response?.data,
    request: {
      url: transportError?.config?.url,
      method: transportError?.config?.method,
      data: transportError?.config?.data,
    },
  }
}
