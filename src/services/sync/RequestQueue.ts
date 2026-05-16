/**
 * Request Queue for Failed Operations
 *
 * Queues failed API requests for automatic retry when online.
 * Uses IndexedDB for persistent storage across sessions.
 *
 * Benefits:
 * - Users never lose work due to network failures
 * - Automatic retry when connection restores
 * - Persistent queue survives page reloads
 * - Configurable retry strategies
 *
 * @module services/sync/RequestQueue
 */

import { generalLogger } from '../../utils/logger'
import { requestBackgroundSync } from '../../utils/serviceWorkerRegistration'

export interface QueuedRequest {
  /**
   * Unique request ID
   */
  id?: number

  /**
   * Request URL
   */
  url: string

  /**
   * HTTP method
   */
  method: string

  /**
   * Request headers
   */
  headers: Record<string, string>

  /**
   * Request body (JSON string)
   */
  body: string | null

  /**
   * Timestamp when request was queued
   */
  timestamp: number

  /**
   * Number of retry attempts
   */
  retryCount: number

  /**
   * Maximum retry attempts
   */
  maxRetries: number

  /**
   * Request metadata
   */
  metadata?: {
    reportId?: string
    operation?: string
    [key: string]: any
  }
}

/**
 * Request Queue Manager
 * Manages persistent queue of failed requests
 */
export class RequestQueue {
  private db: IDBDatabase | null = null
  private readonly DB_NAME = 'UpswitchSyncDB'
  private readonly DB_VERSION = 1
  private readonly STORE_NAME = 'pendingRequests'

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => {
        generalLogger.error('[RequestQueue] DB open failed', {
          error: request.error?.message,
        })
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        generalLogger.info('[RequestQueue] DB opened successfully')
        resolve(this.db)
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          })

          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('url', 'url', { unique: false })

          generalLogger.info('[RequestQueue] Object store created')
        }
      }
    })
  }

  /**
   * Add request to queue
   */
  async enqueue(request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retryCount'>): Promise<number> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)

      const queuedRequest: Omit<QueuedRequest, 'id'> = {
        ...request,
        timestamp: Date.now(),
        retryCount: 0,
      }

      const addRequest = store.add(queuedRequest)

      addRequest.onsuccess = () => {
        const id = addRequest.result as number

        generalLogger.info('[RequestQueue] Request queued', {
          id,
          url: request.url,
          method: request.method,
        })

        // Request background sync
        requestBackgroundSync().catch((error) => {
          generalLogger.warn('[RequestQueue] Background sync request failed', {
            error: error.message,
          })
        })

        resolve(id)
      }

      addRequest.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to queue request', {
          error: addRequest.error?.message,
        })
        reject(addRequest.error)
      }
    })
  }

  /**
   * Get all queued requests
   */
  async getAll(): Promise<QueuedRequest[]> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to get requests', {
          error: request.error?.message,
        })
        reject(request.error)
      }
    })
  }

  /**
   * Get specific request by ID
   */
  async get(id: number): Promise<QueuedRequest | null> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => {
        resolve(request.result || null)
      }

      request.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to get request', {
          id,
          error: request.error?.message,
        })
        reject(request.error)
      }
    })
  }

  /**
   * Remove request from queue
   */
  async remove(id: number): Promise<void> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => {
        generalLogger.info('[RequestQueue] Request removed', { id })
        resolve()
      }

      request.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to remove request', {
          id,
          error: request.error?.message,
        })
        reject(request.error)
      }
    })
  }

  /**
   * Update request (e.g., increment retry count)
   */
  async update(request: QueuedRequest): Promise<void> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const updateRequest = store.put(request)

      updateRequest.onsuccess = () => {
        generalLogger.debug('[RequestQueue] Request updated', {
          id: request.id,
        })
        resolve()
      }

      updateRequest.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to update request', {
          id: request.id,
          error: updateRequest.error?.message,
        })
        reject(updateRequest.error)
      }
    })
  }

  /**
   * Process queue - retry all pending requests
   */
  async processQueue(): Promise<{
    succeeded: number
    failed: number
    total: number
  }> {
    generalLogger.info('[RequestQueue] Processing queue')

    const requests = await this.getAll()
    let succeeded = 0
    let failed = 0

    for (const request of requests) {
      try {
        // Check if max retries exceeded
        if (request.retryCount >= request.maxRetries) {
          generalLogger.warn('[RequestQueue] Max retries exceeded', {
            id: request.id,
            retryCount: request.retryCount,
            maxRetries: request.maxRetries,
          })
          if (request.id) await this.remove(request.id)
          failed++
          continue
        }

        // Execute request
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        })

        if (response.ok) {
          // Success - remove from queue
          generalLogger.info('[RequestQueue] Request succeeded', {
            id: request.id,
            url: request.url,
          })
          if (request.id) await this.remove(request.id)
          succeeded++
        } else {
          // Failed - increment retry count
          generalLogger.warn('[RequestQueue] Request failed', {
            id: request.id,
            status: response.status,
            retryCount: request.retryCount + 1,
          })

          request.retryCount++
          await this.update(request)
          failed++
        }
      } catch (error) {
        // Network error - increment retry count
        generalLogger.error('[RequestQueue] Request error', {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
          retryCount: request.retryCount + 1,
        })

        request.retryCount++
        await this.update(request)
        failed++
      }
    }

    generalLogger.info('[RequestQueue] Queue processing complete', {
      total: requests.length,
      succeeded,
      failed,
    })

    return {
      succeeded,
      failed,
      total: requests.length,
    }
  }

  /**
   * Clear all queued requests
   */
  async clear(): Promise<void> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        generalLogger.info('[RequestQueue] Queue cleared')
        resolve()
      }

      request.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to clear queue', {
          error: request.error?.message,
        })
        reject(request.error)
      }
    })
  }

  /**
   * Get queue size
   */
  async size(): Promise<number> {
    const db = await this.initDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.count()

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        generalLogger.error('[RequestQueue] Failed to get queue size', {
          error: request.error?.message,
        })
        reject(request.error)
      }
    })
  }
}

// Export singleton instance
export const requestQueue = new RequestQueue()

// Auto-process queue when online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    generalLogger.info('[RequestQueue] Network online, processing queue')
    requestQueue.processQueue().catch((error) => {
      generalLogger.error('[RequestQueue] Auto-process failed', {
        error: error.message,
      })
    })
  })
}
