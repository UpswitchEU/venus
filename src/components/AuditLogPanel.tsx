/**
 * Audit Log Panel Component
 *
 * Single Responsibility: Display audit trail for compliance
 * Shows timeline of all changes for M&A due diligence
 *
 * @module components/AuditLogPanel
 */

'use client'

import { Calendar, Edit3, RefreshCw, Save, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React, { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { formatVersionAuthor } from '../utils/formatters'
import { dateLikeToUnixMs } from '@/utils/date-like'
import { formatCurrency } from '../config/countries'
import { valuationAuditService } from '../services/audit/ValuationAuditService'
import type { SessionAuditEntry } from '../utils/sessionAuditTrail'

export interface AuditLogPanelProps {
  reportId: string
  countryCode?: string
}

/**
 * Audit Log Panel
 *
 * Displays chronological audit trail of all changes.
 *
 * Features:
 * - Timeline view of edits, regenerations, version creations
 * - Filter by operation type
 * - Export to CSV for compliance
 * - Statistics summary
 *
 * @example
 * ```tsx
 * <AuditLogPanel reportId="val_123" countryCode="BE" />
 * ```
 */
export function AuditLogPanel({ reportId, countryCode = 'BE' }: AuditLogPanelProps) {
  const t = useTranslations('auditLog')
  const { user } = useAuth()
  const [filterOperation, setFilterOperation] = useState<string>('all')

  const formatAuthor = (userId: string | null | undefined) =>
    formatVersionAuthor(userId, user, {
      user: t('user'),
      guest: t('guest'),
    })

  // Get audit log
  const auditLog = useMemo(() => {
    return valuationAuditService.getAuditLog(reportId)
  }, [reportId])

  // Get statistics
  const stats = useMemo(() => {
    return valuationAuditService.getStatistics(reportId)
  }, [reportId])

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (filterOperation === 'all') {
      return auditLog
    }
    return auditLog.filter((entry) => entry.operation === filterOperation)
  }, [auditLog, filterOperation])

  // Sort by timestamp (newest first)
  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort(
      (a, b) =>
        (dateLikeToUnixMs(b.timestamp) ?? 0) - (dateLikeToUnixMs(a.timestamp) ?? 0)
    )
  }, [filteredEntries])

  const handleExport = () => {
    const csv = valuationAuditService.exportAuditLog(reportId, 'csv')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${reportId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (auditLog.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-foreground/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Edit3 className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{t('noAuditTrailYet')}</h3>
        <p className="text-sm text-muted-foreground">{t('changesWillAppearHere')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header with statistics */}
      <div className="p-6 border-b border-foreground/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-foreground">{t('title')}</h2>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/90 hover:bg-primary/10 rounded-lg transition-colors"
          >
            {t('exportCsv')}
          </button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <p className="text-sm text-primary font-medium mb-1">{t('totalEdits')}</p>
            <p className="text-2xl font-bold text-primary">{stats.totalEdits}</p>
          </div>
          <div className="p-3 bg-moss-50 rounded-lg">
            <p className="text-sm text-moss-600 font-medium mb-1">{t('regenerations')}</p>
            <p className="text-2xl font-bold text-moss-700">{stats.totalRegenerations}</p>
          </div>
          <div className="p-3 bg-accent/10 rounded-lg">
            <p className="text-sm text-accent font-medium mb-1">{t('versions')}</p>
            <p className="text-2xl font-bold text-accent">{stats.totalVersions}</p>
          </div>
        </div>

        {/* Most edited fields */}
        {stats.mostEditedFields.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground font-medium mb-2">
              {t('mostEditedFields')}
            </p>
            <div className="flex flex-wrap gap-2">
              {stats.mostEditedFields.map((item) => (
                <span
                  key={item.field}
                  className="px-3 py-1 bg-muted text-foreground text-sm rounded-full"
                >
                  {item.field} ({item.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mt-4">
          <select
            value={filterOperation}
            onChange={(e) => setFilterOperation(e.target.value)}
            className="px-3 py-2 border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">{t('filterAll')}</option>
            <option value="EDIT">{t('filterFieldEdits')}</option>
            <option value="REGENERATE">{t('filterRegenerations')}</option>
            <option value="VERSION_CREATE">{t('filterVersionCreations')}</option>
            <option value="SWITCH_VIEW">{t('filterFlowSwitches')}</option>
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-foreground/10">
          {sortedEntries.map((entry) => (
            <AuditLogEntry
              key={entry.id}
              entry={entry}
              countryCode={countryCode}
              formatAuthor={formatAuthor}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Audit Log Entry
 *
 * Individual entry in audit timeline.
 */
interface AuditLogEntryProps {
  entry: SessionAuditEntry
  countryCode: string
  formatAuthor: (userId: string | null | undefined) => string
}

function AuditLogEntry({ entry, countryCode, formatAuthor }: AuditLogEntryProps): React.ReactElement {
  const t = useTranslations('auditLog')

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatValue = (value: unknown): string => {
    if (value == null) return 'N/A'
    if (typeof value === 'number') {
      // Format as currency if looks like money (>1000 and in financial fields)
      if (Math.abs(value) > 1000) {
        return formatCurrency(value, countryCode)
      }
      return value.toLocaleString()
    }
    if (typeof value === 'string') {
      return value
    }
    return JSON.stringify(value)
  }

  // Get icon based on operation
  const getIcon = () => {
    switch (entry.operation) {
      case 'EDIT':
        return <Edit3 className="w-5 h-5 text-primary" />
      case 'REGENERATE':
        return <RefreshCw className="w-5 h-5 text-moss-600" />
      case 'VERSION_CREATE':
        return <Save className="w-5 h-5 text-accent" />
      default:
        return <Calendar className="w-5 h-5 text-muted-foreground" />
    }
  }

  // Get operation label
  const getLabel = (): string => {
    switch (entry.operation) {
      case 'EDIT':
        return t('operationEdit')
      case 'REGENERATE':
        return t('operationRegenerate')
      case 'VERSION_CREATE':
        return t('operationVersionCreate')
      case 'SWITCH_VIEW':
        return t('operationSwitchView')
      default:
        return entry.operation
    }
  }

  // Get background color based on operation
  const getBgColor = (): string => {
    switch (entry.operation) {
      case 'EDIT':
        return 'bg-primary/10'
      case 'REGENERATE':
        return 'bg-moss-50'
      case 'VERSION_CREATE':
        return 'bg-accent/10'
      default:
        return 'bg-muted'
    }
  }

  const operationLabel = getLabel()
  const operationIcon = getIcon()
  const bgColor = getBgColor()

  return (
    <div className="p-4 hover:bg-muted transition-colors">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full ${bgColor} flex items-center justify-center`}
        >
          {operationIcon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-foreground">{operationLabel}</span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{formatDate(entry.timestamp)}</span>
          </div>

          {/* Details based on operation type */}
          {entry.operation === 'EDIT' && entry.metadata?.field ? (
            <div className="text-sm text-muted-foreground mt-2">
              <p className="mb-1">
                <span className="font-medium text-foreground">
                  {String(entry.metadata?.fieldLabel || entry.metadata?.field || '')}
                </span>
                {t('changed')}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-muted-foreground">
                  {formatValue(entry.metadata.oldValue)}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">
                  {formatValue(entry.metadata.newValue)}
                </span>
                {typeof entry.metadata.percentChange === 'number' && (
                  <span
                    className={`text-sm font-medium ${
                      entry.metadata.percentChange > 0 ? 'text-moss-600' : 'text-rust-600'
                    }`}
                  >
                    ({entry.metadata.percentChange > 0 ? '+' : ''}
                    {entry.metadata.percentChange.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {entry.operation === 'REGENERATE' && entry.metadata ? (
            <div className="text-sm text-muted-foreground mt-2">
              <p className="mb-1">
                {t('createdVersion')}{' '}
                <span className="font-medium">
                  {t('version')} {String(entry.metadata.versionNumber || '')}
                </span>
              </p>
              {Array.isArray(entry.metadata.significantChanges) &&
                entry.metadata.significantChanges.length > 0 && (
                  <p className="text-muted-foreground">
                    {t('significantChanges')} {entry.metadata.significantChanges.join(', ')}
                  </p>
                )}
            </div>
          ) : null}

          {entry.operation === 'VERSION_CREATE' && entry.metadata ? (
            <div className="text-sm text-muted-foreground mt-2">
              <p>
                <span className="font-medium">{String(entry.metadata.versionLabel || '')}</span>
                {t('saved')}
              </p>
            </div>
          ) : null}

          {/* User info */}
          {entry.userId && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span>{formatAuthor(entry.userId)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Empty state for audit log
 */
export function AuditLogEmpty() {
  const t = useTranslations('auditLog')
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-16 h-16 bg-foreground/10 rounded-full flex items-center justify-center mb-4">
        <Edit3 className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{t('noChangesYet')}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{t('editOrRegenerateDesc')}</p>
    </div>
  )
}
