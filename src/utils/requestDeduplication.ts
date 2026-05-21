/**
 * Request Deduplication Utility
 *
 * Single Responsibility: Prevent concurrent duplicate requests to same endpoint.
 * Solves 409 conflicts caused by multiple components initializing same session.
 *
 * @module utils/requestDeduplication
 */

import { storeLogger } from '../utils/logger'

/**
 * Request Deduplicator
 *
 * Prevents concurrent requests with same key by caching pending promises.
 * If request is already in-flight, returns the existing promise.
 *
 * Use Case:
 * - Multiple tabs loading same session
 * - Multiple components initializing same report
 * - Race conditions in session creation
 *
 * @example
 * ```typescript
 * const deduplicator = new RequestDeduplicator()
 *
 * // First call: executes function
 * const promise1 = deduplicator.deduplicate('session-123', () => createSession())
 *
 * // Second call (before first completes): returns same promise
 * const promise2 = deduplicator.deduplicate('session-123', () => createSession())
 *
 * // promise1 === promise2 (same instance)
 * ```
 */
export class RequestDeduplicator {
  private pending = new Map<string, Promise<unknown>>()
  private stats = {
    total: 0,
    deduplicated: 0,
    executed: 0,
  }

  /**
   * Deduplicate request by key
   *
   * If request with same key is pending, return existing promise.
   * Otherwise, execute function and cache promise until completion.
   *
   * @param key - Unique request identifier
   * @param fn - Function to execute (should return Promise)
   * @returns Result from function or cached promise
   */
  deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.stats.total++

    // Check if request already in-flight
    if (this.pending.has(key)) {
      this.stats.deduplicated++
      storeLogger.debug('Request deduplicated (already in-flight)', {
        key,
        pendingCount: this.pending.size,
        stats: this.stats,
      })
      return this.pending.get(key) as Promise<T>
    }

    // Execute request and cache promise
    this.stats.executed++
    const promise = fn()
      .then((result) => {
        // Remove from pending on success
        this.pending.delete(key)
        storeLogger.debug('Request completed', {
          key,
          success: true,
          pendingCount: this.pending.size,
        })
        return result
      })
      .catch((error) => {
        // Remove from pending on error (allow retry)
        this.pending.delete(key)
        storeLogger.debug('Request failed', {
          key,
          error: error.message,
          pendingCount: this.pending.size,
        })
        throw error
      })

    this.pending.set(key, promise)
    return promise
  }

  /**
   * Clear all pending requests
   *
   * Use when: Component unmounts or session reset
   */
  clear(): void {
    const count = this.pending.size
    this.pending.clear()
    storeLogger.debug('Cleared all pending requests', { count })
  }

  /**
   * Clear specific request
   *
   * @param key - Request key to clear
   */
  clearKey(key: string): void {
    const existed = this.pending.delete(key)
    if (existed) {
      storeLogger.debug('Cleared pending request', { key })
    }
  }

  /**
   * Get deduplication statistics
   *
   * Useful for monitoring and debugging.
   *
   * @returns Stats object with counts
   */
  getStats(): {
    total: number
    deduplicated: number
    executed: number
    pending: number
    deduplicationRate: number
  } {
    return {
      ...this.stats,
      pending: this.pending.size,
      deduplicationRate: this.stats.total > 0 ? this.stats.deduplicated / this.stats.total : 0,
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      deduplicated: 0,
      executed: 0,
    }
  }
}

// Singleton instance for global request deduplication
export const globalRequestDeduplicator = new RequestDeduplicator()

/**
 * Convenience function for one-off deduplication
 *
 * @param key - Unique request identifier
 * @param fn - Function to execute
 * @returns Result from function or cached promise
 *
 * @example
 * ```typescript
 * const session = await deduplicateRequest('session-val_123', async () => {
 *   return await backendAPI.createSession(reportId)
 * })
 * ```
 */
export async function deduplicateRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return globalRequestDeduplicator.deduplicate(key, fn)
}
