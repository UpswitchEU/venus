/**
 * Session Audit Trail
 *
 * Single Responsibility: Immutable audit logging for all session operations.
 * Provides complete audit trail for compliance and debugging.
 *
 * Framework requirement: Lines 1533-1551 (Audit Trail & Transparency)
 *
 * @module utils/sessionAuditTrail
 */

import { storeLogger } from './logger'
import { createRandomId } from './secureRandom'

export type SessionOperation =
  | 'CREATE'
  | 'LOAD'
  | 'UPDATE'
  | 'SWITCH_VIEW'
  | 'RESTORE'
  | 'DELETE'
  | 'SYNC'
  | 'REGENERATE' // User triggered recalculation (M&A workflow)
  | 'EDIT' // User modified field (M&A workflow)
  | 'VERSION_CREATE' // New version created (M&A workflow)

export interface SessionAuditEntry {
  /** Unique audit entry ID */
  id: string
  /** Timestamp of operation */
  timestamp: Date
  /** Operation type */
  operation: SessionOperation
  /** Report/session identifier */
  reportId: string
  /** Whether operation succeeded */
  success: boolean
  /** Operation duration in milliseconds */
  duration_ms: number
  /** Correlation ID for request tracing */
  correlationId?: string
  /** Error message if failed */
  error?: string
  /** Additional operation metadata */
  metadata: Record<string, unknown>
  /** User ID if authenticated */
  userId?: string
  /** Session ID if applicable */
  sessionId?: string
}

/**
 * Immutable Audit Trail
 *
 * Stores all session operations for:
 * - Compliance/regulatory requirements
 * - Debugging and troubleshooting
 * - Performance analysis
 * - Security audits
 *
 * Features:
 * - Immutable entries (cannot be modified after creation)
 * - Automatic ID generation
 * - Timestamp capture
 * - Searchable by reportId, operation, time range
 * - Export for external audit systems
 *
 * @example
 * ```typescript
 * const auditTrail = new SessionAuditTrail()
 *
 * // Log session creation
 * auditTrail.log({
 *   operation: 'CREATE',
 *   reportId: 'val_123',
 *   success: true,
 *   duration_ms: 245,
 *   correlationId: 'session-create-a7f3e2c1-1765751234',
 *   metadata: { view: 'manual' }
 * })
 *
 * // Query audit trail
 * const entries = auditTrail.getByReportId('val_123')
 * ```
 */
export class SessionAuditTrail {
  private entries: SessionAuditEntry[] = []
  private readonly maxEntries = 10000

  /**
   * Log audit entry (immutable)
   *
   * Once logged, entries cannot be modified (immutability requirement).
   *
   * @param entry - Audit entry data (id and timestamp auto-generated)
   * @returns Generated audit entry
   */
  log(entry: Omit<SessionAuditEntry, 'id' | 'timestamp'>): SessionAuditEntry {
    const auditEntry: SessionAuditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date(),
      ...entry,
    }

    // Make entry immutable
    Object.freeze(auditEntry)
    Object.freeze(auditEntry.metadata)

    this.entries.push(auditEntry)

    // Limit size
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }

    // Log to console
    const logData = {
      auditId: auditEntry.id,
      operation: auditEntry.operation,
      reportId: auditEntry.reportId,
      success: auditEntry.success,
      duration_ms: auditEntry.duration_ms.toFixed(2),
      correlationId: auditEntry.correlationId,
      error: auditEntry.error,
      metadata: auditEntry.metadata,
    }

    if (auditEntry.success) {
      storeLogger.info('Audit trail entry', logData)
    } else {
      storeLogger.error('Audit trail entry (FAILED)', logData)
    }

    return auditEntry
  }

  /**
   * Generate unique audit entry ID
   */
  private generateAuditId(): string {
    return createRandomId('audit', 12)
  }

  /**
   * Get all audit entries
   *
   * @returns Array of all entries (cloned to prevent modification)
   */
  getAll(): SessionAuditEntry[] {
    return [...this.entries]
  }

  /**
   * Get entries by report ID
   *
   * @param reportId - Report identifier
   * @returns Array of matching entries
   */
  getByReportId(reportId: string): SessionAuditEntry[] {
    return this.entries.filter((entry) => entry.reportId === reportId)
  }

  /**
   * Get entries by operation type
   *
   * @param operation - Operation type
   * @returns Array of matching entries
   */
  getByOperation(operation: SessionOperation): SessionAuditEntry[] {
    return this.entries.filter((entry) => entry.operation === operation)
  }

  /**
   * Get entries by correlation ID
   *
   * @param correlationId - Correlation ID
   * @returns Array of matching entries
   */
  getByCorrelationId(correlationId: string): SessionAuditEntry[] {
    return this.entries.filter((entry) => entry.correlationId === correlationId)
  }

  /**
   * Get entries in time range
   *
   * @param start - Start date
   * @param end - End date
   * @returns Array of entries in range
   */
  getByTimeRange(start: Date, end: Date): SessionAuditEntry[] {
    return this.entries.filter((entry) => entry.timestamp >= start && entry.timestamp <= end)
  }

  /**
   * Get failed operations only
   *
   * @returns Array of failed entries
   */
  getFailures(): SessionAuditEntry[] {
    return this.entries.filter((entry) => !entry.success)
  }

  /**
   * Get performance statistics
   *
   * @param operation - Optional operation to filter by
   * @returns Statistics object
   */
  getStats(operation?: SessionOperation): {
    totalOperations: number
    successCount: number
    failureCount: number
    successRate: number
    avgDuration_ms: number
    p95Duration_ms: number
  } {
    const filtered = operation
      ? this.entries.filter((e) => e.operation === operation)
      : this.entries

    if (filtered.length === 0) {
      return {
        totalOperations: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDuration_ms: 0,
        p95Duration_ms: 0,
      }
    }

    const successCount = filtered.filter((e) => e.success).length
    const failureCount = filtered.filter((e) => !e.success).length
    const durations = filtered.map((e) => e.duration_ms).sort((a, b) => a - b)
    const sum = durations.reduce((acc, d) => acc + d, 0)

    return {
      totalOperations: filtered.length,
      successCount,
      failureCount,
      successRate: successCount / filtered.length,
      avgDuration_ms: sum / filtered.length,
      p95Duration_ms: durations[Math.floor(durations.length * 0.95)],
    }
  }

  /**
   * Export audit trail for external systems
   *
   * @param format - Export format
   * @returns Serialized audit trail
   */
  export(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.entries, null, 2)
    }

    // CSV format
    const headers = [
      'id',
      'timestamp',
      'operation',
      'reportId',
      'success',
      'duration_ms',
      'correlationId',
      'error',
      'sessionId',
      'userId',
    ]

    const rows = this.entries.map((entry) => [
      entry.id,
      entry.timestamp.toISOString(),
      entry.operation,
      entry.reportId,
      entry.success.toString(),
      entry.duration_ms.toString(),
      entry.correlationId || '',
      entry.error || '',
      entry.sessionId || '',
      entry.userId || '',
    ])

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  }

  /**
   * Clear audit trail
   *
   * Use with caution - audit trails should be preserved.
   */
  clear(): void {
    const count = this.entries.length
    this.entries = []
    storeLogger.warn('Audit trail cleared', { entriesRemoved: count })
  }
}

// Global audit trail instance
export const globalAuditTrail = new SessionAuditTrail()

/**
 * Log session operation to audit trail
 *
 * Convenience function for one-off audit logging.
 *
 * @param entry - Audit entry data
 * @returns Generated audit entry
 *
 * @example
 * ```typescript
 * logSessionOperation({
 *   operation: 'CREATE',
 *   reportId: 'val_123',
 *   success: true,
 *   duration_ms: 245,
 *   metadata: { view: 'manual' }
 * })
 * ```
 */
export function logSessionOperation(
  entry: Omit<SessionAuditEntry, 'id' | 'timestamp'>
): SessionAuditEntry {
  return globalAuditTrail.log(entry)
}
