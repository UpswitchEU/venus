/**
 * Error Recovery System
 *
 * World-Class Error Recovery:
 * - Automatic retry with exponential backoff
 * - Error classification (network, auth, validation)
 * - User-friendly error messages
 * - Recovery suggestions
 */

export type ErrorCategory = 'network' | 'auth' | 'validation' | 'server' | 'unknown'

export interface ErrorRecoveryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  onRetry?: (attempt: number, error: Error) => void
  shouldRetry?: (error: Error) => boolean
}

export interface ErrorRecoveryResult<T> {
  success: boolean
  data?: T
  error?: Error
  attempts: number
}

/**
 * Classify error type for appropriate handling
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!(error instanceof Error)) {
    return 'unknown'
  }

  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  // Network errors (including timeout)
  if (
    name === 'networkerror' ||
    name === 'typeerror' ||
    name === 'aborterror' ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  ) {
    return 'network'
  }

  // Auth errors
  if (
    name === 'autherror' ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('token') ||
    message.includes('authentication')
  ) {
    return 'auth'
  }

  // Validation errors
  if (
    name === 'validationerror' ||
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required') ||
    message.includes('400')
  ) {
    return 'validation'
  }

  // Server errors
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('server error') ||
    message.includes('internal error')
  ) {
    return 'server'
  }

  return 'unknown'
}

/**
 * Get user-friendly error message based on error category
 */
export function getUserFriendlyErrorMessage(error: unknown, category?: ErrorCategory): string {
  const errorCategory = category || classifyError(error)

  // Check for specific timeout errors
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : ''
  const isTimeout =
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('aborted')

  switch (errorCategory) {
    case 'network':
      if (isTimeout) {
        return 'The request took too long to complete. The server might be experiencing high load. Please try again.'
      }
      return 'Network connection failed. Please check your internet connection and try again.'
    case 'auth':
      return 'Your session has expired. Please log in again to continue.'
    case 'validation':
      return 'Invalid data provided. Please check your input and try again.'
    case 'server':
      return 'The server is experiencing issues. Please try again in a moment.'
    default:
      return error instanceof Error
        ? error.message
        : 'An unexpected error occurred. Please try again.'
  }
}

/**
 * Get recovery suggestions based on error category
 */
export function getRecoverySuggestions(error: unknown, category?: ErrorCategory): string[] {
  const errorCategory = category || classifyError(error)

  switch (errorCategory) {
    case 'network':
      return [
        'Check your internet connection',
        'Try refreshing the page',
        'Disable VPN or proxy if enabled',
      ]
    case 'auth':
      return [
        'Log out and log back in',
        'Clear browser cookies and try again',
        'Check if your session has expired',
      ]
    case 'validation':
      return [
        'Review the form fields for errors',
        'Ensure all required fields are filled',
        'Check data format and constraints',
      ]
    case 'server':
      return [
        'Wait a moment and try again',
        'Check if the service is under maintenance',
        'Contact support if the problem persists',
      ]
    default:
      return [
        'Try refreshing the page',
        'Clear browser cache',
        'Contact support if the problem persists',
      ]
  }
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt)
  return Math.min(delay, maxDelay)
}

/**
 * Retry function with exponential backoff
 *
 * World-Class Retry Logic:
 * - Exponential backoff
 * - Error classification
 * - Configurable retry conditions
 * - User-friendly error messages
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: ErrorRecoveryOptions = {}
): Promise<ErrorRecoveryResult<T>> {
  const { maxRetries = 3, baseDelay = 500, maxDelay = 10000, onRetry, shouldRetry } = options

  let lastError: Error | undefined
  let attempts = 0

  for (attempts = 0; attempts <= maxRetries; attempts++) {
    try {
      const data = await fn()
      return {
        success: true,
        data,
        attempts: attempts + 1,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(lastError)) {
        return {
          success: false,
          error: lastError,
          attempts: attempts + 1,
        }
      }

      // Don't retry on last attempt
      if (attempts >= maxRetries) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = calculateBackoffDelay(attempts, baseDelay, maxDelay)

      // Notify about retry
      if (onRetry) {
        onRetry(attempts + 1, lastError)
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
  }
}

/**
 * Default retry condition - retry network and server errors, not auth/validation
 */
export function defaultShouldRetry(error: Error): boolean {
  const category = classifyError(error)
  return category === 'network' || category === 'server'
}
