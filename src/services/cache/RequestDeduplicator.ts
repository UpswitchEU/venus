/**
 * Request Deduplicator
 *
 * Prevents duplicate concurrent requests by caching in-flight promises.
 * Multiple components requesting the same data get the same promise.
 *
 * Benefits:
 * - Only 1 network call for concurrent requests
 * - Reduced server load
 * - Faster response (reuse in-flight requests)
 * - No race conditions
 *
 * @module services/cache/RequestDeduplicator
 */

import { generalLogger } from '../../utils/logger'

/**
 * Request deduplicator singleton
 * Caches in-flight requests by key to prevent duplicates
 */
export class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<unknown>>()
  private requestCounts = new Map<string, number>() // Track how many times a request was deduped

  /**
   * Deduplicate a request by key
   * If request is already pending, returns existing promise
   * Otherwise, starts new request and caches promise
   *
   * @param key - Unique key for the request (e.g., 'session:reportId123')
   * @param fn - Function that returns the promise to execute
   * @returns Promise with the result
   */
  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Check if request is already pending
    const pending = this.pendingRequests.get(key)
    if (pending) {
      const count = this.requestCounts.get(key) || 0
      this.requestCounts.set(key, count + 1)

      generalLogger.debug('[RequestDeduplicator] Reusing in-flight request', {
        key,
        dedupedCount: count + 1,
      })

      return pending as Promise<T>
    }

    // Start new request and cache promise
    generalLogger.debug('[RequestDeduplicator] Starting new request', { key })

    const promise = fn()
      .then((result) => {
        // Clean up on success
        this.pendingRequests.delete(key)

        const dedupedCount = this.requestCounts.get(key) || 0
        if (dedupedCount > 0) {
          generalLogger.info('[RequestDeduplicator] Request completed (saved duplicates)', {
            key,
            savedRequests: dedupedCount,
          })
        }
        this.requestCounts.delete(key)

        return result
      })
      .catch((error) => {
        // Clean up on error
        this.pendingRequests.delete(key)
        this.requestCounts.delete(key)

        generalLogger.error('[RequestDeduplicator] Request failed', {
          key,
          error: error instanceof Error ? error.message : String(error),
        })

        throw error
      })

    this.pendingRequests.set(key, promise)
    return promise
  }

  /**
   * Cancel a pending request by key
   * Useful for cleanup or canceling stale requests
   */
  cancel(key: string): void {
    if (this.pendingRequests.has(key)) {
      this.pendingRequests.delete(key)
      this.requestCounts.delete(key)

      generalLogger.debug('[RequestDeduplicator] Request cancelled', { key })
    }
  }

  /**
   * Cancel all pending requests
   * Useful for cleanup on unmount or route changes
   */
  cancelAll(): void {
    const count = this.pendingRequests.size

    this.pendingRequests.clear()
    this.requestCounts.clear()

    if (count > 0) {
      generalLogger.info('[RequestDeduplicator] All requests cancelled', {
        count,
      })
    }
  }

  /**
   * Get stats about deduplication
   * Useful for monitoring and debugging
   */
  getStats(): {
    pendingCount: number
    totalSavedRequests: number
  } {
    const totalSavedRequests = Array.from(this.requestCounts.values()).reduce(
      (sum, count) => sum + count,
      0
    )

    return {
      pendingCount: this.pendingRequests.size,
      totalSavedRequests,
    }
  }

  /**
   * Check if a request is currently pending
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key)
  }
}

// Export singleton instance
export const requestDeduplicator = new RequestDeduplicator()
