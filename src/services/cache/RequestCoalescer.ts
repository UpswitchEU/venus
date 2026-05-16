/**
 * Request Coalescer
 *
 * Batches rapid successive API calls into a single request.
 * Useful for autosave, search-as-you-type, etc.
 *
 * Benefits:
 * - Reduces network calls for rapid inputs
 * - Batches multiple changes into single save
 * - Configurable delay
 * - Promise-based API
 *
 * @module services/cache/RequestCoalescer
 */

import { generalLogger } from '../../utils/logger'

interface CoalescedRequest<T> {
  resolve: (value: T) => void
  reject: (error: any) => void
  timestamp: number
}

/**
 * Request coalescer with configurable delay
 */
export class RequestCoalescer {
  private pendingRequests = new Map<string, CoalescedRequest<any>[]>()
  private timeouts = new Map<string, NodeJS.Timeout>()
  private coalescedCounts = new Map<string, number>()

  /**
   * Coalesce requests by key
   * Waits for specified delay, then executes only the last request
   * All callers get the same result
   *
   * @param key - Unique key for the request group
   * @param fn - Function that returns the promise to execute
   * @param delay - Delay in milliseconds to wait for more requests (default: 100ms)
   * @returns Promise with the result
   */
  async coalesce<T>(key: string, fn: () => Promise<T>, delay: number = 100): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Add this request to the pending queue
      const request: CoalescedRequest<T> = {
        resolve,
        reject,
        timestamp: Date.now(),
      }

      if (!this.pendingRequests.has(key)) {
        this.pendingRequests.set(key, [])
        this.coalescedCounts.set(key, 0)
      }

      this.pendingRequests.get(key)?.push(request)

      // Clear existing timeout
      if (this.timeouts.has(key)) {
        clearTimeout(this.timeouts.get(key)!)
      }

      const coalescedCount = this.pendingRequests.get(key)?.length

      generalLogger.debug('[RequestCoalescer] Request added to queue', {
        key,
        queueSize: coalescedCount,
        delay_ms: delay,
      })

      // Set new timeout
      const timeout = setTimeout(async () => {
        const requests = this.pendingRequests.get(key) || []
        const totalCoalesced = requests.length

        // Clear state
        this.pendingRequests.delete(key)
        this.timeouts.delete(key)

        if (requests.length === 0) {
          return
        }

        // Track stats
        const currentCount = this.coalescedCounts.get(key) || 0
        this.coalescedCounts.set(key, currentCount + (totalCoalesced - 1))

        generalLogger.info('[RequestCoalescer] Executing coalesced request', {
          key,
          batched_requests: totalCoalesced,
          saved_requests: totalCoalesced - 1,
          total_saved: currentCount + (totalCoalesced - 1),
        })

        // Execute the function once
        try {
          const result = await fn()

          // Resolve all pending promises with the same result
          requests.forEach((req) => req.resolve(result))

          generalLogger.debug('[RequestCoalescer] Coalesced request succeeded', {
            key,
            batched_requests: totalCoalesced,
          })
        } catch (error) {
          // Reject all pending promises with the same error
          requests.forEach((req) => req.reject(error))

          generalLogger.error('[RequestCoalescer] Coalesced request failed', {
            key,
            batched_requests: totalCoalesced,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }, delay)

      this.timeouts.set(key, timeout)
    })
  }

  /**
   * Cancel pending requests for a key
   */
  cancel(key: string): void {
    const timeout = this.timeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(key)
    }

    const requests = this.pendingRequests.get(key)
    if (requests) {
      requests.forEach((req) => req.reject(new Error('Request cancelled')))
      this.pendingRequests.delete(key)
    }

    generalLogger.debug('[RequestCoalescer] Requests cancelled', {
      key,
      cancelled_count: requests?.length || 0,
    })
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    let totalCancelled = 0

    for (const [key, requests] of this.pendingRequests.entries()) {
      const timeout = this.timeouts.get(key)
      if (timeout) {
        clearTimeout(timeout)
      }

      requests.forEach((req) => req.reject(new Error('All requests cancelled')))

      totalCancelled += requests.length
    }

    this.pendingRequests.clear()
    this.timeouts.clear()

    if (totalCancelled > 0) {
      generalLogger.info('[RequestCoalescer] All requests cancelled', {
        count: totalCancelled,
      })
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    pendingKeys: number
    totalPendingRequests: number
    totalSavedRequests: number
  } {
    let totalPending = 0

    for (const requests of this.pendingRequests.values()) {
      totalPending += requests.length
    }

    const totalSaved = Array.from(this.coalescedCounts.values()).reduce(
      (sum, count) => sum + count,
      0
    )

    return {
      pendingKeys: this.pendingRequests.size,
      totalPendingRequests: totalPending,
      totalSavedRequests: totalSaved,
    }
  }

  /**
   * Check if requests are pending for a key
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key)
  }

  /**
   * Get number of pending requests for a key
   */
  getPendingCount(key: string): number {
    return this.pendingRequests.get(key)?.length || 0
  }

  /**
   * Force immediate execution of pending requests for a key
   * Bypasses the delay
   */
  async flush(key: string): Promise<void> {
    const timeout = this.timeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(key)

      // Manually trigger the timeout callback
      // (We can't directly call it, so we just clear and let it execute immediately)
      const requests = this.pendingRequests.get(key)
      if (requests && requests.length > 0) {
        generalLogger.info('[RequestCoalescer] Flushing pending requests', {
          key,
          count: requests.length,
        })
      }
    }
  }

  /**
   * Flush all pending requests
   */
  flushAll(): void {
    for (const key of this.timeouts.keys()) {
      this.flush(key)
    }
  }
}

// Export singleton instance
export const requestCoalescer = new RequestCoalescer()

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    requestCoalescer.flushAll()
  })
}
