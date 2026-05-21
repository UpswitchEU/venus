/**
 * Valuation Audit Service
 *
 * Single Responsibility: Track field-level changes for compliance
 * Critical for M&A workflow - who changed what when
 *
 * @module services/audit/ValuationAuditService
 */

import { dateLikeToUnixMs } from '@/utils/date-like'
import type { VersionChanges } from '../../types/ValuationVersion'
import { createContextLogger } from '../../utils/logger'
import type { SessionAuditEntry } from '../../utils/sessionAuditTrail'
import { globalAuditTrail } from '../../utils/sessionAuditTrail'

const auditLogger = createContextLogger('ValuationAuditService')

/**
 * Field change audit entry
 *
 * Tracks individual field changes for compliance.
 */
export interface FieldChangeAudit {
  reportId: string
  field: string
  fieldLabel: string
  oldValue: unknown
  newValue: unknown
  changeType: 'addition' | 'modification' | 'deletion'
  percentChange?: number
  timestamp: Date
  userId?: string
  correlationId?: string
}

type FieldChangeMetadata = {
  field: string
  fieldLabel?: string
  oldValue?: unknown
  newValue?: unknown
  changeType?: FieldChangeAudit['changeType']
  percentChange?: number
}

type FieldChangeAuditEntry = SessionAuditEntry & {
  operation: 'EDIT'
  metadata: FieldChangeMetadata
}

function isFieldChangeAuditEntry(entry: SessionAuditEntry): entry is FieldChangeAuditEntry {
  return entry.operation === 'EDIT' && typeof entry.metadata.field === 'string'
}

function csvCell(value: unknown): string {
  if (value == null) return ''
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return `"${raw.replace(/"/g, '""')}"`
}

/**
 * Regeneration audit entry
 *
 * Tracks valuation regeneration events.
 */
export interface RegenerationAudit {
  reportId: string
  versionNumber: number
  previousVersionNumber?: number
  changesSummary: VersionChanges
  calculationDuration_ms?: number
  timestamp: Date
  userId?: string
  correlationId?: string
}

/**
 * Valuation Audit Service
 *
 * Provides field-level audit logging for M&A compliance.
 *
 * Features:
 * - Track every field change (who, what, when)
 * - Track valuation regenerations
 * - Track version creations
 * - Query by report, field, user, time range
 * - Export for compliance reports
 *
 * @example
 * ```typescript
 * const auditService = ValuationAuditService.getInstance()
 *
 * // Log field change
 * auditService.logFieldChange(
 *   'val_123',
 *   'ebitda',
 *   'EBITDA',
 *   500000,
 *   750000,
 *   'user_456'
 * )
 *
 * // Get audit log for report
 * const log = auditService.getAuditLog('val_123')
 * ```
 */
export class ValuationAuditService {
  private static instance: ValuationAuditService

  private constructor() {
    auditLogger.info('ValuationAuditService initialized')
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ValuationAuditService {
    if (!this.instance) {
      this.instance = new ValuationAuditService()
    }
    return this.instance
  }

  /**
   * Log field change
   *
   * Tracks when user modifies a specific field.
   *
   * @param reportId - Report identifier
   * @param field - Field name (e.g., 'ebitda', 'revenue')
   * @param fieldLabel - Human-readable label (e.g., 'EBITDA', 'Revenue')
   * @param oldValue - Previous value
   * @param newValue - New value
   * @param userId - User ID (optional, for guest tracking)
   */
  logFieldChange(
    reportId: string,
    field: string,
    fieldLabel: string,
    oldValue: unknown,
    newValue: unknown,
    userId?: string
  ): SessionAuditEntry {
    // Calculate percent change for numeric fields
    let percentChange: number | undefined
    if (typeof oldValue === 'number' && typeof newValue === 'number' && oldValue !== 0) {
      percentChange = ((newValue - oldValue) / Math.abs(oldValue)) * 100
    }

    // Determine change type
    let changeType: 'addition' | 'modification' | 'deletion'
    if (oldValue == null || oldValue === '') {
      changeType = 'addition'
    } else if (newValue == null || newValue === '') {
      changeType = 'deletion'
    } else {
      changeType = 'modification'
    }

    const entry = globalAuditTrail.log({
      operation: 'EDIT',
      reportId,
      success: true,
      duration_ms: 0,
      userId,
      metadata: {
        field,
        fieldLabel,
        oldValue,
        newValue,
        changeType,
        percentChange,
      },
    })

    auditLogger.info('Field change logged', {
      reportId,
      field,
      changeType,
      percentChange: percentChange?.toFixed(2),
    })

    return entry
  }

  /**
   * Log valuation regeneration
   *
   * Tracks when user triggers recalculation with updated data.
   *
   * @param reportId - Report identifier
   * @param versionNumber - New version number created
   * @param changesSummary - Summary of changes from previous version
   * @param calculationDuration_ms - Time taken for calculation
   * @param userId - User ID
   */
  logRegeneration(
    reportId: string,
    versionNumber: number,
    changesSummary: VersionChanges,
    calculationDuration_ms?: number,
    userId?: string
  ): SessionAuditEntry {
    const entry = globalAuditTrail.log({
      operation: 'REGENERATE',
      reportId,
      success: true,
      duration_ms: calculationDuration_ms || 0,
      userId,
      metadata: {
        versionNumber,
        previousVersionNumber: versionNumber > 1 ? versionNumber - 1 : undefined,
        totalChanges: changesSummary.totalChanges,
        significantChanges: changesSummary.significantChanges,
        revenueChange: changesSummary.revenue,
        ebitdaChange: changesSummary.ebitda,
      },
    })

    auditLogger.info('Regeneration logged', {
      reportId,
      versionNumber,
      totalChanges: changesSummary.totalChanges,
      significantChanges: changesSummary.significantChanges.length,
    })

    return entry
  }

  /**
   * Log version creation
   *
   * Tracks when new version is saved.
   *
   * @param reportId - Report identifier
   * @param versionNumber - Version number
   * @param versionLabel - Version label
   * @param userId - User ID
   */
  logVersionCreation(
    reportId: string,
    versionNumber: number,
    versionLabel: string,
    userId?: string
  ): SessionAuditEntry {
    const entry = globalAuditTrail.log({
      operation: 'VERSION_CREATE',
      reportId,
      success: true,
      duration_ms: 0,
      userId,
      metadata: {
        versionNumber,
        versionLabel,
      },
    })

    auditLogger.info('Version creation logged', {
      reportId,
      versionNumber,
      versionLabel,
    })

    return entry
  }

  /**
   * Get audit log for specific report
   *
   * @param reportId - Report identifier
   * @returns Array of audit entries
   */
  getAuditLog(reportId: string): SessionAuditEntry[] {
    return globalAuditTrail.getByReportId(reportId)
  }

  /**
   * Get field changes for specific report
   *
   * Filters audit log to only field change entries.
   *
   * @param reportId - Report identifier
   * @returns Array of field change entries
   */
  getFieldChanges(reportId: string): Array<SessionAuditEntry & { metadata: { field: string } }> {
    const allEntries = globalAuditTrail.getByReportId(reportId)
    return allEntries.filter(isFieldChangeAuditEntry)
  }

  /**
   * Get regenerations for specific report
   *
   * @param reportId - Report identifier
   * @returns Array of regeneration entries
   */
  getRegenerations(reportId: string): Array<SessionAuditEntry> {
    const allEntries = globalAuditTrail.getByReportId(reportId)
    return allEntries.filter((entry) => entry.operation === 'REGENERATE')
  }

  /**
   * Get version creations for specific report
   *
   * @param reportId - Report identifier
   * @returns Array of version creation entries
   */
  getVersionCreations(reportId: string): Array<SessionAuditEntry> {
    const allEntries = globalAuditTrail.getByReportId(reportId)
    return allEntries.filter((entry) => entry.operation === 'VERSION_CREATE')
  }

  /**
   * Get audit statistics for report
   *
   * @param reportId - Report identifier
   * @returns Statistics summary
   */
  getStatistics(reportId: string): {
    totalEdits: number
    totalRegenerations: number
    totalVersions: number
    mostEditedFields: Array<{ field: string; count: number }>
    firstEdit: Date | null
    lastEdit: Date | null
  } {
    const fieldChanges = this.getFieldChanges(reportId)
    const regenerations = this.getRegenerations(reportId)
    const versions = this.getVersionCreations(reportId)

    // Count edits by field
    const fieldCounts = new Map<string, number>()
    fieldChanges.forEach((entry) => {
      const field = entry.metadata.field
      fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1)
    })

    // Sort by count
    const mostEditedFields = Array.from(fieldCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Get first and last edit dates
    const sortedByDate = [...fieldChanges].sort(
      (a, b) => (dateLikeToUnixMs(a.timestamp) ?? 0) - (dateLikeToUnixMs(b.timestamp) ?? 0)
    )

    return {
      totalEdits: fieldChanges.length,
      totalRegenerations: regenerations.length,
      totalVersions: versions.length,
      mostEditedFields,
      firstEdit: sortedByDate[0]?.timestamp || null,
      lastEdit: sortedByDate[sortedByDate.length - 1]?.timestamp || null,
    }
  }

  /**
   * Export audit log for report
   *
   * @param reportId - Report identifier
   * @param format - Export format
   * @returns Serialized audit log
   */
  exportAuditLog(reportId: string, format: 'json' | 'csv' = 'json'): string {
    const entries = this.getAuditLog(reportId)

    if (format === 'json') {
      return JSON.stringify(entries, null, 2)
    }

    // CSV format
    const headers = [
      'timestamp',
      'operation',
      'field',
      'oldValue',
      'newValue',
      'changeType',
      'percentChange',
      'userId',
    ]

    const rows = entries.filter(isFieldChangeAuditEntry).map((entry) => {
      const { metadata } = entry
      return [
        entry.timestamp.toISOString(),
        entry.operation,
        metadata.field,
        metadata.oldValue,
        metadata.newValue,
        metadata.changeType,
        typeof metadata.percentChange === 'number' ? metadata.percentChange.toFixed(2) : '',
        entry.userId || 'guest',
      ].map(csvCell)
    })

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  }
}

// Singleton instance
export const valuationAuditService = ValuationAuditService.getInstance()
