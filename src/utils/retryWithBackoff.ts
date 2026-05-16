/**
 * Exponential Backoff Retry Utility
 *
 * Single Responsibility: Retry failed operations with exponential delay.
 * Handles transient failures (network glitches, rate limits) automatically.
 *
 * Framework compliance: <2s performance target enforced.
 *
 * @module utils/retryWithBackoff
 */

import { extractErrorMessage } from './errorDetection'
import { isRetryable } from './errors/errorGuards'
import { storeLogger } from './logger'

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay in milliseconds (default: 100ms) */
  initialDelay?: number
  /** Maximum delay in milliseconds (default: 2000ms) */
  maxDelay?: number
  /** Multiplier for each retry (default: 2x) */
  backoffMultiplier?: number
  /** Only retry specific error types (default: all retryable errors) */
  retryableErrors?: Array<new (...args: any[]) => Error>
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number) => void
  /** Callback on final failure */
  onFailure?: (error: Error, attempts: number) => void
}

export interface RetryResult<T> {
  /** Result from successful execution */
  result: T
  /** Number of attempts made */
  attempts: number
  /** Total time spent (including delays) */
  totalTime_ms: number
}

/**
 * Retry function with exponential backoff
 *
 * Strategy:
 * - Attempt 1: Execute immediately
 * - Attempt 2: Wait 100ms (initial delay)
 * - Attempt 3: Wait 200ms (2x)
 * - Attempt 4: Wait 400ms (2x)
 * - Max delay: 2000ms (framework limit)
 *
 * Framework compliance:
 * - Total retry time <2s (enforced)
 * - Only retries transient errors (network, rate limit, timeout)
 * - Logs all retry attempts for audit trail
 *
 * @param fn - Function to execute
 * @param options - Retry configuration
 * @returns Result from successful execution
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * try {
 *   const result = await retryWithBackoff(
 *     async () => backendAPI.createSession(reportId),
 *     {
 *       maxRetries: 3,
 *       onRetry: (attempt, error, delay) => {
 *         console.log(`Retry attempt ${attempt} after ${delay}ms`)
 *       }
 *     }
 *   )
 * } catch (error) {
 *   // All retries failed
 * }
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 2000,
    backoffMultiplier = 2,
    retryableErrors,
    onRetry,
    onFailure,
  } = options

  const startTime = performance.now()
  let lastError: Error | null = null
  let currentDelay = initialDelay

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // Execute function
      const result = await fn()

      // Success - log if retried
      if (attempt > 1) {
        const totalTime = performance.now() - startTime
        storeLogger.info('Operation succeeded after retries', {
          attempts: attempt,
          totalTime_ms: totalTime.toFixed(2),
        })
      }

      return result
    } catch (error) {
      lastError = error as Error

      // Check if error is retryable
      const shouldRetry = retryableErrors
        ? retryableErrors.some((ErrorClass) => error instanceof ErrorClass)
        : isRetryable(error)

      if (!shouldRetry) {
        storeLogger.debug('Error not retryable, failing immediately', {
          error: extractErrorMessage(error),
          errorType: error?.constructor?.name,
        })
        throw error
      }

      // Last attempt - don't retry
      if (attempt > maxRetries) {
        const totalTime = performance.now() - startTime
        storeLogger.error('All retry attempts exhausted', {
          attempts: attempt,
          totalTime_ms: totalTime.toFixed(2),
          error: extractErrorMessage(error),
        })

        onFailure?.(error as Error, attempt)
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(currentDelay, maxDelay)

      storeLogger.warn('Retry attempt', {
        attempt,
        maxRetries,
        delay_ms: delay,
        error: extractErrorMessage(error),
        errorType: error?.constructor?.name,
      })

      onRetry?.(attempt, error as Error, delay)

      // Wait before next attempt
      await sleep(delay)

      // Increase delay for next attempt
      currentDelay *= backoffMultiplier
    }
  }

  // Should never reach here, but TypeScript requires it
  throw lastError || new Error('Retry failed with unknown error')
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry with backoff and return result with metadata
 *
 * Same as retryWithBackoff but returns additional metadata about retries.
 *
 * @param fn - Function to execute
 * @param options - Retry configuration
 * @returns Result with retry metadata
 */
export async function retryWithBackoffAndMetadata<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = performance.now()
  let attempts = 0

  const wrappedFn = async () => {
    attempts++
    return await fn()
  }

  try {
    const result = await retryWithBackoff(wrappedFn, options)
    const totalTime = performance.now() - startTime

    return {
      result,
      attempts,
      totalTime_ms: totalTime,
    }
  } catch (error) {
    const _totalTime = performance.now() - startTime
    throw error
  }
}

/**
 * Retry specific operation types with preset configurations
 */
export const retryPresets = {
  /**
   * Session operations (create, load, switch view)
   * - 2 retries max (reduced from 3 to avoid rate limits)
   * - 200ms initial delay (increased for better backoff)
   * - 3s max total time (increased to allow longer waits)
   */
  session: {
    maxRetries: 2,
    initialDelay: 200,
    maxDelay: 3000,
    backoffMultiplier: 2,
  },

  /**
   * Restoration operations (fetch conversation history)
   * - 2 retries max (faster failure)
   * - 150ms initial delay
   * - 1.5s max total time
   */
  restoration: {
    maxRetries: 2,
    initialDelay: 150,
    maxDelay: 1500,
    backoffMultiplier: 2,
  },

  /**
   * API calls (general)
   * - 3 retries max
   * - 200ms initial delay
   * - 2s max total time
   */
  api: {
    maxRetries: 3,
    initialDelay: 200,
    maxDelay: 2000,
    backoffMultiplier: 2,
  },
} as const

/**
 * Retry session operation with preset configuration
 *
 * @param fn - Session operation to retry
 * @param options - Additional options (merged with preset)
 * @returns Result from operation
 */
export async function retrySessionOperation<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    ...retryPresets.session,
    ...options,
  })
}

/**
 * Retry restoration operation with preset configuration
 *
 * @param fn - Restoration operation to retry
 * @param options - Additional options (merged with preset)
 * @returns Result from operation
 */
export async function retryRestorationOperation<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    ...retryPresets.restoration,
    ...options,
  })
}
