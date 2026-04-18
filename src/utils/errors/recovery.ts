/**
 * Error Recovery Strategies
 *
 * Implements retry logic and recovery strategies for different error types
 */

import { markRefreshCompleted, wasRefreshedRecently } from '../auth/cross-tab-refresh'
import { getLogoutAbortSignal } from '../auth/logout-abort'
import { getActiveRefreshPromise, setActiveRefreshPromise } from '../auth/refreshMutex'
import { apiLogger } from '../logger'
import { AppError } from './types'

export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  jitter: boolean
}

export interface RecoveryStrategy {
  canRecover: (error: AppError) => boolean
  recover: (error: AppError) => Promise<boolean>
  getRetryDelay: (attempt: number, config: RetryConfig) => number
}

export class ErrorRecoveryManager {
  private static strategies: Map<string, RecoveryStrategy> = new Map()
  private static defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
  }

  /**
   * Register a recovery strategy
   */
  static registerStrategy(errorCode: string, strategy: RecoveryStrategy): void {
    this.strategies.set(errorCode, strategy)
    apiLogger.debug('Recovery strategy registered', { errorCode })
  }

  /**
   * Attempt to recover from an error
   */
  static async attemptRecovery(error: AppError): Promise<boolean> {
    const strategy = this.strategies.get(error.code)
    if (!strategy) {
      apiLogger.debug('No recovery strategy found', { errorCode: error.code })
      return false
    }

    if (!strategy.canRecover(error)) {
      apiLogger.debug('Error cannot be recovered', { errorCode: error.code })
      return false
    }

    try {
      const recovered = await strategy.recover(error)
      apiLogger.info('Recovery attempt completed', {
        errorCode: error.code,
        recovered,
      })
      return recovered
    } catch (recoveryError) {
      apiLogger.error('Recovery attempt failed', {
        errorCode: error.code,
        recoveryError: recoveryError instanceof Error ? recoveryError.message : 'Unknown error',
      })
      return false
    }
  }

  /**
   * Execute retry logic with exponential backoff
   */
  static async retry<T>(operation: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T> {
    const retryConfig = { ...this.defaultConfig, ...config }
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation()
        if (attempt > 0) {
          apiLogger.info('Retry successful', { attempt })
        }
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')

        if (attempt === retryConfig.maxRetries) {
          apiLogger.error('Retry exhausted', {
            attempts: attempt + 1,
            error: lastError.message,
          })
          throw lastError
        }

        const delay = this.getRetryDelay(attempt, retryConfig)
        apiLogger.debug('Retrying operation', {
          attempt: attempt + 1,
          delay,
          error: lastError.message,
        })

        await this.sleep(delay)
      }
    }

    throw lastError || new Error('Retry failed')
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private static getRetryDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt)
    delay = Math.min(delay, config.maxDelay)

    if (config.jitter) {
      // Add random jitter to prevent thundering herd
      delay = delay * (0.5 + Math.random() * 0.5)
    }

    return Math.floor(delay)
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Initialize default recovery strategies
   */
  static initializeDefaultStrategies(): void {
    // Network error recovery
    this.registerStrategy('NETWORK_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Check if connection is restored
        try {
          const response = await fetch('/api/health', {
            method: 'GET',
            cache: 'no-cache',
            signal: AbortSignal.timeout(5000),
          })
          return response.ok
        } catch {
          return false
        }
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    // Timeout error recovery
    this.registerStrategy('TIMEOUT_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Wait and try again
        await this.sleep(1000)
        return true
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    // Server error recovery
    this.registerStrategy('SERVER_ERROR', {
      canRecover: (error) => error.statusCode >= 500,
      recover: async () => {
        // Wait for server to recover
        await this.sleep(2000)
        return true
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    // Registry error recovery
    this.registerStrategy('REGISTRY_ERROR', {
      canRecover: (error) => error.statusCode >= 500,
      recover: async () => {
        // Wait for registry service to recover
        await this.sleep(1500)
        return true
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    // Rate limit recovery
    this.registerStrategy('RATE_LIMIT_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Wait for rate limit to reset
        await this.sleep(5000)
        return true
      },
      getRetryDelay: (attempt) => Math.min(5000 * (attempt + 1), 30000),
    })

    // Circuit breaker recovery
    this.registerStrategy('CIRCUIT_BREAKER_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Wait for circuit breaker to reset
        await this.sleep(10000)
        return true
      },
      getRetryDelay: (attempt) => Math.min(10000 * (attempt + 1), 60000),
    })

    // Authentication error recovery — coordinated with useTokenRefresh and
    // checkSession via the cross-tab marker and shared in-tab mutex so the
    // recovery strategy never duplicates a refresh that is already in flight
    // (which would race the rotated refresh token and 401).
    this.registerStrategy('AUTH_ERROR', {
      canRecover: () => true,
      recover: async () => {
        try {
          if (wasRefreshedRecently()) {
            return true
          }
          const existing = getActiveRefreshPromise()
          if (existing) {
            return existing
          }
          const promise = (async () => {
            try {
              const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include',
                signal: getLogoutAbortSignal(),
              })
              if (response.ok) {
                markRefreshCompleted()
              }
              return response.ok
            } finally {
              setActiveRefreshPromise(null)
            }
          })()
          setActiveRefreshPromise(promise)
          return promise
        } catch {
          window.location.href = '/login'
          return false
        }
      },
      getRetryDelay: () => 0, // No delay for auth errors
    })

    // Cache error recovery
    this.registerStrategy('CACHE_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Clear cache and continue
        try {
          if ('caches' in window) {
            const cacheNames = await caches.keys()
            await Promise.all(cacheNames.map((name) => caches.delete(name)))
          }
          return true
        } catch {
          return false
        }
      },
      getRetryDelay: () => 0, // No delay for cache errors
    })

    // Streaming error recovery
    this.registerStrategy('STREAMING_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Wait and try to reconnect
        await this.sleep(2000)
        return true
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    // Database error recovery
    this.registerStrategy('DATABASE_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Wait for database to recover
        await this.sleep(3000)
        return true
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    // External service error recovery
    this.registerStrategy('EXTERNAL_SERVICE_ERROR', {
      canRecover: () => true,
      recover: async () => {
        // Wait for external service to recover
        await this.sleep(5000)
        return true
      },
      getRetryDelay: (attempt, config) => this.getRetryDelay(attempt, config),
    })

    apiLogger.info('Default recovery strategies initialized')
  }
}

// Initialize default strategies on module load
ErrorRecoveryManager.initializeDefaultStrategies()
