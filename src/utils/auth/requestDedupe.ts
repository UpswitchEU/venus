/**
 * Request Deduplication
 *
 * Prevents duplicate concurrent auth requests
 * Shares results across concurrent callers
 */

interface PendingRequest<T> {
  promise: Promise<T>
  timestamp: number
}

export class RequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest<unknown>> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup stale requests every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 30000)
    this.cleanupInterval.unref?.()
  }

  /**
   * Execute request with deduplication
   *
   * If a request with the same key is already in flight,
   * returns the existing promise instead of making a new request
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    maxAge: number = 5000 // 5 seconds max age for pending requests
  ): Promise<T> {
    // Check if request is already pending
    const pending = this.pendingRequests.get(key)

    if (pending) {
      // Check if request is still fresh
      const age = Date.now() - pending.timestamp
      if (age < maxAge) {
        // Return existing promise
        return pending.promise as Promise<T>
      } else {
        // Request is stale, remove it
        this.pendingRequests.delete(key)
      }
    }

    // Create new request
    const promise = fn()
      .then((result) => {
        // Remove from pending on success
        this.pendingRequests.delete(key)
        return result
      })
      .catch((error) => {
        // Remove from pending on error
        this.pendingRequests.delete(key)
        throw error
      })

    // Store pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
    })

    return promise
  }

  /**
   * Check if request is pending
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key)
  }

  /**
   * Cancel pending request
   */
  cancel(key: string): void {
    this.pendingRequests.delete(key)
  }

  /**
   * Cleanup stale requests
   */
  private cleanup(): void {
    const now = Date.now()
    const maxAge = 10000 // 10 seconds

    for (const [key, pending] of this.pendingRequests.entries()) {
      const age = now - pending.timestamp
      if (age > maxAge) {
        this.pendingRequests.delete(key)
      }
    }
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear()
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clear()
  }
}

// Singleton instance
let requestDeduplicator: RequestDeduplicator | null = null

/**
 * Get request deduplicator instance
 */
export function getRequestDeduplicator(): RequestDeduplicator {
  if (!requestDeduplicator) {
    requestDeduplicator = new RequestDeduplicator()
  }
  return requestDeduplicator
}

/**
 * Cleanup request deduplicator (for testing)
 */
export function destroyRequestDeduplicator(): void {
  if (requestDeduplicator) {
    requestDeduplicator.destroy()
    requestDeduplicator = null
  }
}
