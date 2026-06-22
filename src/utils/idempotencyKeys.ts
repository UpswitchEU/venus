/**
 * Idempotency Key Generator
 *
 * Single Responsibility: Generate unique idempotency keys for preventing duplicate operations.
 * Enables safe retries without creating duplicate resources.
 *
 * @module utils/idempotencyKeys
 */

import { storeLogger } from './logger'
import {
  createManagedInterval,
  type ManagedIntervalStartOptions,
  type ManagedIntervalStopOptions,
} from './managedInterval'
import { createRandomToken } from './secureRandom'

const NONCE_PREFIX = 'n'
const IDEMPOTENCY_KEY_CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Generate idempotency key for operation
 *
 * Format: {reportId}-{operation}-{timestamp}-{nonce}
 *
 * Idempotency keys allow:
 * - Safe retries after network failures
 * - Backend recognizes duplicate requests
 * - Prevents duplicate resource creation
 *
 * Backend should:
 * - Store idempotency key with resource
 * - Return existing resource if key matches
 * - Keys expire after 24 hours
 *
 * @param reportId - Report identifier
 * @param operation - Operation type ('create', 'update', 'switch-view', etc.)
 * @returns Idempotency key string
 *
 * @example
 * ```typescript
 * const key = generateIdempotencyKey('val_123', 'create')
 * // Returns: "val_123-create-1765751234567-nabc123def0"
 *
 * await fetch('/api/sessions', {
 *   method: 'POST',
 *   headers: {
 *     'Idempotency-Key': key
 *   },
 *   body: JSON.stringify(session)
 * })
 *
 * // If retry needed, use same key:
 * await fetch('/api/sessions', {
 *   method: 'POST',
 *   headers: {
 *     'Idempotency-Key': key  // Same key - backend returns existing session
 *   },
 *   body: JSON.stringify(session)
 * })
 * ```
 */
export function generateIdempotencyKey(reportId: string, operation: string): string {
  const timestamp = Date.now()
  const nonce = `${NONCE_PREFIX}${createRandomToken(10)}`
  return `${reportId}-${operation}-${timestamp}-${nonce}`
}

/**
 * Parse idempotency key into components
 *
 * @param key - Idempotency key to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * ```typescript
 * const parsed = parseIdempotencyKey('val_123-create-1765751234567')
 * // Returns: { reportId: 'val_123', operation: 'create', timestamp: 1765751234567 }
 * ```
 */
export function parseIdempotencyKey(key: string): {
  reportId: string
  operation: string
  timestamp: number
} | null {
  const parts = key.split('-')

  if (parts.length < 3) {
    return null
  }

  const last = parts.at(-1) ?? ''
  const secondLast = parts.at(-2) ?? ''

  // New format: {reportId}-{operation}-{timestamp}-{nonce}. Prefer the
  // timestamp position over nonce shape so an all-digit nonce cannot look old.
  if (parts.length >= 4 && /^\d+$/.test(secondLast)) {
    const timestamp = parseInt(secondLast, 10)
    const operation = parts.at(-3) ?? ''
    const reportId = parts.slice(0, -3).join('-')
    return {
      reportId,
      operation,
      timestamp,
    }
  }

  // Legacy: {reportId}-{operation}-{timestamp} — last segment is numeric millis
  const timestamp = parseInt(last, 10)
  if (isNaN(timestamp)) {
    return null
  }

  const operation = parts.at(-2) ?? ''
  const reportId = parts.slice(0, -2).join('-')

  return {
    reportId,
    operation,
    timestamp,
  }
}

/**
 * Check if idempotency key is expired
 *
 * Keys expire after 24 hours (standard practice).
 *
 * @param key - Idempotency key to check
 * @param expiryHours - Hours until expiry (default: 24)
 * @returns true if key is expired
 *
 * @example
 * ```typescript
 * const key = generateIdempotencyKey('val_123', 'create')
 *
 * // Check if expired after 24 hours
 * if (isIdempotencyKeyExpired(key)) {
 *   // Generate new key
 * }
 * ```
 */
export function isIdempotencyKeyExpired(key: string, expiryHours: number = 24): boolean {
  const parsed = parseIdempotencyKey(key)
  if (!parsed) {
    return true // Invalid key = expired
  }

  const now = Date.now()
  const age_ms = now - parsed.timestamp
  const expiry_ms = expiryHours * 60 * 60 * 1000

  return age_ms > expiry_ms
}

/**
 * Idempotency key manager
 *
 * Manages active idempotency keys for operations.
 * Stores keys in memory for deduplication within same session.
 */
export class IdempotencyKeyManager {
  private keys = new Map<string, string>()

  /**
   * Get or create idempotency key for operation
   *
   * Returns existing key if operation is pending.
   * Creates new key if operation is not pending or key expired.
   *
   * @param reportId - Report identifier
   * @param operation - Operation type
   * @returns Idempotency key
   */
  getOrCreate(reportId: string, operation: string): string {
    const cacheKey = `${reportId}:${operation}`
    const existing = this.keys.get(cacheKey)

    if (existing && !isIdempotencyKeyExpired(existing)) {
      return existing
    }

    // Create new key
    const key = generateIdempotencyKey(reportId, operation)
    this.keys.set(cacheKey, key)

    return key
  }

  /**
   * Clear key after operation completes
   *
   * @param reportId - Report identifier
   * @param operation - Operation type
   */
  clear(reportId: string, operation: string): void {
    const cacheKey = `${reportId}:${operation}`
    this.keys.delete(cacheKey)
  }

  /**
   * Clear all keys
   */
  clearAll(): void {
    this.keys.clear()
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeKeys: number
    expiredKeys: number
  } {
    let expiredCount = 0

    this.keys.forEach((key) => {
      if (isIdempotencyKeyExpired(key)) {
        expiredCount++
      }
    })

    return {
      activeKeys: this.keys.size,
      expiredKeys: expiredCount,
    }
  }

  /**
   * Cleanup expired keys
   */
  cleanupExpired(): number {
    let cleaned = 0

    this.keys.forEach((key, cacheKey) => {
      if (isIdempotencyKeyExpired(key)) {
        this.keys.delete(cacheKey)
        cleaned++
      }
    })

    if (cleaned > 0) {
      storeLogger.debug('Cleaned up expired idempotency keys', { cleaned })
    }

    return cleaned
  }
}

// Global idempotency key manager
export const globalIdempotencyManager = new IdempotencyKeyManager()

function cleanupGlobalIdempotencyKeys(): void {
  globalIdempotencyManager.cleanupExpired()
}

const idempotencyKeyCleanupInterval = createManagedInterval(
  cleanupGlobalIdempotencyKeys,
  IDEMPOTENCY_KEY_CLEANUP_INTERVAL_MS
)

export function startIdempotencyKeyCleanup(options?: ManagedIntervalStartOptions): void {
  idempotencyKeyCleanupInterval.start(options)
}

export function stopIdempotencyKeyCleanup(options?: ManagedIntervalStopOptions): void {
  idempotencyKeyCleanupInterval.stop(options)
}

// Cleanup expired keys every hour
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  startIdempotencyKeyCleanup()
}
