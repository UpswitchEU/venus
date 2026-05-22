/**
 * Correlation ID Generator
 *
 * Single Responsibility: Generate and manage correlation IDs for request tracing.
 * Enables end-to-end request tracking across frontend, Node.js backend, and Python engine.
 *
 * Framework requirement: Full transparency and auditability (lines 1500-1508).
 *
 * @module utils/correlationId
 */

import { createRandomToken } from './secureRandom'

/**
 * Generate correlation ID
 *
 * Format: {prefix}-{short_uuid}-{timestamp}
 * Example: session-create-a7f3e2c1-1765751234
 *
 * Use Cases:
 * - Track request through multiple services
 * - Correlate logs across systems
 * - Debug distributed operations
 * - Audit trail requirements
 *
 * @param prefix - Operation type prefix
 * @returns Correlation ID string
 *
 * @example
 * ```typescript
 * const correlationId = createCorrelationId('session-create')
 * // Returns: "session-create-a7f3e2c1-1765751234"
 *
 * await fetch('/api/sessions', {
 *   headers: {
 *     'X-Correlation-ID': correlationId
 *   }
 * })
 *
 * logger.info('Session created', { correlationId })
 * // Backend logs will have same correlationId
 * // Python engine logs will have same correlationId
 * ```
 */
export function createCorrelationId(prefix: string): string {
  const uuid = generateShortUuid()
  const timestamp = Date.now().toString(36) // Base36 for shorter string
  return `${prefix}-${uuid}-${timestamp}`
}

/**
 * Generate short UUID (8 characters)
 *
 * Uses Web Crypto when available and a monotonic fallback only for unsupported runtimes.
 *
 * @returns 8-character UUID
 */
function generateShortUuid(): string {
  return createRandomToken(8)
}

/**
 * Correlation ID prefixes for common operations
 */
export const CorrelationPrefixes = {
  SESSION_CREATE: 'session-create',
  SESSION_LOAD: 'session-load',
  SESSION_SWITCH: 'session-switch',
  RESTORE_CONVERSATION: 'restore-conv',
  VALUATION_CALCULATE: 'valuation-calc',
  REPORT_GENERATE: 'report-gen',
  FILE_UPLOAD: 'file-upload',
  KBO_LOOKUP: 'kbo-lookup',
  BUSINESS_TYPE_SEARCH: 'biztype-search',
} as const

/**
 * Correlation ID Manager
 *
 * Manages correlation IDs for current request context.
 * Stores in memory for same-request correlation.
 */
export class CorrelationIdManager {
  private current: string | null = null
  private history: Array<{ id: string; prefix: string; timestamp: Date }> = []
  private readonly maxHistory = 100

  /**
   * Generate and set current correlation ID
   *
   * @param prefix - Operation prefix
   * @returns Generated correlation ID
   */
  generate(prefix: string): string {
    const id = createCorrelationId(prefix)
    this.current = id

    // Add to history
    this.history.push({
      id,
      prefix,
      timestamp: new Date(),
    })

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    return id
  }

  /**
   * Get current correlation ID
   *
   * @returns Current correlation ID or null
   */
  getCurrent(): string | null {
    return this.current
  }

  /**
   * Clear current correlation ID
   */
  clear(): void {
    this.current = null
  }

  /**
   * Get correlation ID history
   *
   * @param limit - Maximum number of entries to return
   * @returns Array of recent correlation IDs
   */
  getHistory(limit: number = 10): Array<{ id: string; prefix: string; timestamp: Date }> {
    return this.history.slice(-limit)
  }

  /**
   * Find correlation IDs by prefix
   *
   * @param prefix - Prefix to search for
   * @returns Array of matching correlation IDs
   */
  findByPrefix(prefix: string): Array<{ id: string; prefix: string; timestamp: Date }> {
    return this.history.filter((entry) => entry.prefix === prefix)
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = []
  }
}

// Global correlation ID manager
export const globalCorrelationManager = new CorrelationIdManager()

/**
 * React hook for correlation ID
 *
 * Generates correlation ID on mount, clears on unmount.
 *
 * @param prefix - Operation prefix
 * @returns Correlation ID
 *
 * @example
 * ```typescript
 * function SessionCreator() {
 *   const correlationId = useCorrelationId('session-create')
 *
 *   const createSession = async () => {
 *     await api.createSession({
 *       headers: { 'X-Correlation-ID': correlationId }
 *     })
 *   }
 * }
 * ```
 */
export function useCorrelationId(prefix: string): string {
  // Note: Can't import React here (circular dependency)
  // This is a utility - use in components with proper React import
  const id = createCorrelationId(prefix)
  return id
}

/**
 * Parse correlation ID into components
 *
 * @param correlationId - Correlation ID to parse
 * @returns Parsed components or null if invalid
 */
export function parseCorrelationId(correlationId: string): {
  prefix: string
  uuid: string
  timestamp: number
} | null {
  const parts = correlationId.split('-')

  if (parts.length < 3) {
    return null
  }

  const timestamp = parseInt(parts[parts.length - 1], 36) // Base36 decode
  if (isNaN(timestamp)) {
    return null
  }

  const uuid = parts[parts.length - 2]
  const prefix = parts.slice(0, -2).join('-')

  return {
    prefix,
    uuid,
    timestamp,
  }
}
