/**
 * Circuit Breaker Pattern
 *
 * Single Responsibility: Prevent cascading failures when backend is down.
 * Fast-fails after threshold reached, tests recovery periodically.
 *
 * Framework compliance: Fail-fast is better than slow failures (reliability > latency).
 *
 * @module utils/circuitBreaker
 */

import { extractErrorMessage } from './errorDetection'
import { storeLogger } from './logger'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number
  /** Time to wait before testing recovery in ms (default: 30000ms = 30s) */
  resetTimeout?: number
  /** Success threshold in half-open state (default: 2) */
  successThreshold?: number
  /** Name for logging (default: 'CircuitBreaker') */
  name?: string
}

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  totalCalls: number
  lastFailureTime: Date | null
  lastSuccessTime: Date | null
}

/**
 * Circuit Breaker
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately (fast-fail)
 * - HALF_OPEN: Testing recovery, limited requests allowed
 *
 * State Transitions:
 * - CLOSED → OPEN: After {failureThreshold} consecutive failures
 * - OPEN → HALF_OPEN: After {resetTimeout} elapsed
 * - HALF_OPEN → CLOSED: After {successThreshold} consecutive successes
 * - HALF_OPEN → OPEN: On any failure
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 *   name: 'SessionAPI'
 * })
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await backendAPI.createSession(reportId)
 *   })
 * } catch (error) {
 *   if (error.message.includes('Circuit breaker is OPEN')) {
 *     // Fast-fail - backend is down
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures = 0
  private successes = 0
  private totalCalls = 0
  private lastFailureTime: Date | null = null
  private lastSuccessTime: Date | null = null
  private resetTimer: NodeJS.Timeout | null = null

  private readonly failureThreshold: number
  private readonly resetTimeout: number
  private readonly successThreshold: number
  private readonly name: string

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5
    this.resetTimeout = options.resetTimeout ?? 30000
    this.successThreshold = options.successThreshold ?? 2
    this.name = options.name ?? 'CircuitBreaker'

    storeLogger.debug('Circuit breaker initialized', {
      name: this.name,
      failureThreshold: this.failureThreshold,
      resetTimeout: this.resetTimeout,
      successThreshold: this.successThreshold,
    })
  }

  /**
   * Execute function through circuit breaker
   *
   * @param fn - Function to execute
   * @returns Result from function
   * @throws Error if circuit is OPEN or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++

    // Check state before execution
    if (this.state === 'OPEN') {
      // Check if reset timeout has elapsed
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen()
      } else {
        // Fast-fail
        const error = new Error(
          `Circuit breaker is OPEN for ${this.name} - failing fast (last failure: ${this.lastFailureTime?.toISOString()})`
        )
        storeLogger.warn('Circuit breaker OPEN - fast fail', {
          name: this.name,
          failures: this.failures,
          lastFailureTime: this.lastFailureTime,
        })
        throw error
      }
    }

    try {
      // Execute function
      const result = await fn()

      // Success
      this.onSuccess()
      return result
    } catch (error) {
      // Failure
      this.onFailure(error as Error)
      throw error
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0
    this.successes++
    this.lastSuccessTime = new Date()

    if (this.state === 'HALF_OPEN') {
      if (this.successes >= this.successThreshold) {
        // Enough successes - close circuit
        this.transitionToClosed()
      } else {
        storeLogger.debug('Circuit breaker HALF_OPEN - success recorded', {
          name: this.name,
          successes: this.successes,
          successThreshold: this.successThreshold,
        })
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    this.failures++
    this.successes = 0
    this.lastFailureTime = new Date()

    storeLogger.warn('Circuit breaker recorded failure', {
      name: this.name,
      failures: this.failures,
      threshold: this.failureThreshold,
      state: this.state,
      error: extractErrorMessage(error),
    })

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open → back to open
      this.transitionToOpen()
    } else if (this.state === 'CLOSED') {
      // Check if threshold reached
      if (this.failures >= this.failureThreshold) {
        this.transitionToOpen()
      }
    }
  }

  /**
   * Transition to CLOSED state (normal operation)
   */
  private transitionToClosed(): void {
    const previousState = this.state
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0

    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }

    storeLogger.info('Circuit breaker CLOSED', {
      name: this.name,
      previousState,
      lastSuccess: this.lastSuccessTime,
    })
  }

  /**
   * Transition to OPEN state (fast-fail)
   */
  private transitionToOpen(): void {
    const previousState = this.state
    this.state = 'OPEN'

    storeLogger.error('Circuit breaker OPEN - fast-failing requests', {
      name: this.name,
      previousState,
      failures: this.failures,
      threshold: this.failureThreshold,
      lastFailure: this.lastFailureTime,
    })

    // Schedule transition to HALF_OPEN
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
    }

    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen()
    }, this.resetTimeout)
  }

  /**
   * Transition to HALF_OPEN state (testing recovery)
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state
    this.state = 'HALF_OPEN'
    this.successes = 0

    storeLogger.info('Circuit breaker HALF_OPEN - testing recovery', {
      name: this.name,
      previousState,
      resetTimeout: this.resetTimeout,
    })
  }

  /**
   * Check if should attempt reset (transition to HALF_OPEN)
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false

    const timeSinceFailure = Date.now() - this.lastFailureTime.getTime()
    return timeSinceFailure >= this.resetTimeout
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    }
  }

  /**
   * Manually reset circuit breaker (for testing or admin override)
   */
  reset(): void {
    storeLogger.info('Circuit breaker manually reset', {
      name: this.name,
      previousState: this.state,
    })

    this.transitionToClosed()
  }

  /**
   * Cleanup (clear timers)
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
  }
}

// Singleton circuit breakers for common operations
export const sessionCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
  name: 'SessionAPI',
})

export const restorationCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 20000,
  successThreshold: 2,
  name: 'RestorationAPI',
})

export const valuationCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
  name: 'ValuationAPI',
})
