/**
 * Error Detection Utilities
 *
 * Single Responsibility: HTTP error status code detection and error message extraction.
 * Pure functions for identifying specific error types (409, 404) across different error structures.
 *
 * @module utils/errorDetection
 */

/**
 * Detects if an error is a 409 Conflict (resource already exists)
 *
 * Checks multiple error structures:
 * - AxiosError: error.response.status === 409
 * - APIError: error.statusCode === 409
 * - Generic: error.status === 409
 *
 * @param error - Error object from any source (Axios, API, fetch, etc.)
 * @returns true if error is a 409 Conflict
 *
 * @example
 * ```typescript
 * try {
 *   await createSession(reportId)
 * } catch (error) {
 *   if (is409Conflict(error)) {
 *     // Handle conflict: load existing session
 *   }
 * }
 * ```
 */
export function is409Conflict(error: unknown): boolean {
  const axiosError = error as any
  return (
    axiosError?.response?.status === 409 ||
    axiosError?.status === 409 ||
    axiosError?.statusCode === 409
  )
}

/**
 * Detects if an error is a 404 Not Found (resource doesn't exist)
 *
 * @param error - Error object from any source
 * @returns true if error is a 404 Not Found
 */
export function is404NotFound(error: unknown): boolean {
  const axiosError = error as any
  return (
    axiosError?.response?.status === 404 ||
    axiosError?.status === 404 ||
    axiosError?.statusCode === 404
  )
}

/**
 * Detects if an error is a 401 Unauthorized
 *
 * @param error - Error object from any source
 * @returns true if error is a 401 Unauthorized
 */
export function is401Unauthorized(error: unknown): boolean {
  const axiosError = error as any
  return (
    axiosError?.response?.status === 401 ||
    axiosError?.status === 401 ||
    axiosError?.statusCode === 401
  )
}

/**
 * Detects if an error is a 403 Forbidden
 *
 * @param error - Error object from any source
 * @returns true if error is a 403 Forbidden
 */
export function is403Forbidden(error: unknown): boolean {
  const axiosError = error as any
  return (
    axiosError?.response?.status === 403 ||
    axiosError?.status === 403 ||
    axiosError?.statusCode === 403
  )
}

/**
 * Detects if an error is an auth error (401 or 403)
 *
 * @param error - Error object from any source
 * @returns true if error is 401 or 403
 */
export function isAuthError(error: unknown): boolean {
  return is401Unauthorized(error) || is403Forbidden(error)
}

/**
 * Detects if an error is a 429 Rate Limit
 *
 * @param error - Error object from any source
 * @returns true if error is a 429 Rate Limit
 */
export function is429RateLimit(error: unknown): boolean {
  const axiosError = error as any
  return (
    axiosError?.response?.status === 429 ||
    axiosError?.status === 429 ||
    axiosError?.statusCode === 429
  )
}

/**
 * Extracts a human-readable error message from various error types
 *
 * Handles:
 * - Error instances: error.message
 * - String errors: returns string directly
 * - Objects with message/error properties
 * - Unknown: returns 'Unknown error'
 *
 * @param error - Error from any source
 * @returns Human-readable error message
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   logger.error('Operation failed', { error: extractErrorMessage(error) })
 * }
 * ```
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  const anyError = error as any
  return anyError?.message || anyError?.error || 'Unknown error'
}

/**
 * Extracts HTTP status code from error if available
 *
 * @param error - Error object
 * @returns HTTP status code or undefined
 */
export function extractStatusCode(error: unknown): number | undefined {
  const axiosError = error as any
  return axiosError?.response?.status || axiosError?.status || axiosError?.statusCode
}
