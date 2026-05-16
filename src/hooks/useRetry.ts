/**
 * useRetry Hook
 * Provides exponential backoff retry mechanism for failed operations
 */

import { useCallback, useRef, useState } from 'react'

interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  onRetry?: (attempt: number, error: Error) => void
  shouldRetry?: (error: Error) => boolean
}

interface RetryState {
  attempt: number
  isRetrying: boolean
  lastError: Error | null
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'shouldRetry'>> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
}

/**
 * Hook for retrying operations with exponential backoff
 */
export function useRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): [(...args: Parameters<T>) => Promise<ReturnType<T>>, RetryState] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const [state, setState] = useState<RetryState>({
    attempt: 0,
    isRetrying: false,
    lastError: null,
  })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const calculateDelay = useCallback(
    (attempt: number): number => {
      const delay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt)
      return Math.min(delay, opts.maxDelay)
    },
    [opts]
  )

  const retry = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
          setState({
            attempt,
            isRetrying: attempt > 0,
            lastError: null,
          })

          const result = await fn(...args)

          // Success - reset state
          setState({
            attempt: 0,
            isRetrying: false,
            lastError: null,
          })

          return result
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))

          // Check if we should retry this error
          if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
            setState({
              attempt,
              isRetrying: false,
              lastError,
            })
            throw lastError
          }

          // If this was the last attempt, throw the error
          if (attempt >= opts.maxRetries) {
            setState({
              attempt,
              isRetrying: false,
              lastError,
            })
            throw lastError
          }

          // Call onRetry callback
          if (opts.onRetry) {
            opts.onRetry(attempt + 1, lastError)
          }

          // Calculate delay and wait before retrying
          const delay = calculateDelay(attempt)

          await new Promise<void>((resolve) => {
            timeoutRef.current = setTimeout(() => {
              resolve()
            }, delay)
          })
        }
      }

      // Should never reach here, but TypeScript needs it
      throw lastError || new Error('Retry failed')
    },
    [fn, opts, calculateDelay]
  )

  return [retry, state]
}

/**
 * Default retry predicate - retry on network errors and 5xx server errors
 */
export function shouldRetryNetworkError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase()

  // Retry on network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('network request failed')
  ) {
    return true
  }

  // Retry on 5xx server errors (if error has status property)
  const anyError = error as any
  if (anyError.response?.status >= 500 && anyError.response?.status < 600) {
    return true
  }

  // Retry on ECONNRESET and other connection errors
  if (
    anyError.code === 'ECONNRESET' ||
    anyError.code === 'ENOTFOUND' ||
    anyError.code === 'ECONNREFUSED'
  ) {
    return true
  }

  // Don't retry on client errors (4xx) or validation errors
  return false
}

/**
 * Create a retry-enabled API call wrapper
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) => {
    let lastError: Error | undefined

    const retryOptions = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      shouldRetry: shouldRetryNetworkError,
      ...options,
    }

    return (async () => {
      for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
        try {
          return await fn(...args)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))

          if (!retryOptions.shouldRetry?.(lastError) || attempt >= retryOptions.maxRetries) {
            throw lastError
          }

          if (retryOptions.onRetry) {
            retryOptions.onRetry(attempt + 1, lastError)
          }

          const delay = Math.min(
            retryOptions.initialDelay * Math.pow(retryOptions.backoffMultiplier, attempt),
            retryOptions.maxDelay
          )

          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      throw lastError ?? new Error('Retry failed without an error')
    })()
  }) as unknown as T
}
