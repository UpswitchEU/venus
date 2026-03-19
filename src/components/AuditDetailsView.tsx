/**
 * AuditDetailsView Component
 *
 * Single Responsibility: Display detailed audit information for a selected version
 * Shows field changes, statistics, and metadata
 *
 * @module components/AuditDetailsView
 */

'use client'

import { ArrowDownRight, ArrowUpRight, Calendar, Clock, Tag, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '../hooks/useAuth'
import type { ValuationVersion } from '../types/ValuationVersion'
import { formatCurrency, formatShareholdingPercentage, formatVersionAuthor } from '../utils/formatters'

export interface AuditDetailsViewProps {
  version: ValuationVersion | null
  className?: string
}

/**
 * Audit Details View
 *
 * Displays comprehensive information about a selected version:
 * - Version header (number, label, date, creator)
 * - Field-level changes with old/new values and percent changes
 * - Statistics summary
 * - Metadata (tags, notes)
 */
export function AuditDetailsView({ version, className = '' }: AuditDetailsViewProps) {
  const t = useTranslations('historyPanel')
  const { user } = useAuth()
  const formatAuthor = (createdBy: string | null | undefined) =>
    formatVersionAuthor(createdBy, user, { user: t('user'), guest: t('guest') })

  if (!version) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center text-muted-foreground p-8">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">{t('selectVersionTitle')}</h3>
          <p className="text-sm">{t('selectVersionDesc')}</p>
        </div>
      </div>
    )
  }

  const countryCode = version.formData.country_code || 'BE'
  const hasChanges = version.changesSummary && version.changesSummary.totalChanges > 0

  return (
    <div className={`h-full overflow-y-auto bg-background ${className}`}>
      <div className="p-6 space-y-6">
        {/* Version Header */}
        <div className="bg-card border border-foreground/10 rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white text-lg font-bold">
                  {version.versionNumber}
                </span>
                <h2 className="text-xl font-semibold text-foreground">{version.versionLabel}</h2>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(version.createdAt)}</span>
                </div>
                {version.createdBy && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>{formatAuthor(version.createdBy)}</span>
                  </div>
                )}
                {version.calculationDuration_ms && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{(version.calculationDuration_ms / 1000).toFixed(2)}s</span>
                  </div>
                )}
              </div>
            </div>
            {version.isActive && (
              <span className="px-3 py-1 text-xs font-medium bg-moss-500/10 text-moss-500 rounded-full border border-moss-500/20">
                {t('active')}
              </span>
            )}
          </div>

          {/* Tags */}
          {version.tags && version.tags.length > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-foreground/10">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <div className="flex flex-wrap gap-2">
                {version.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-muted text-foreground rounded border border-foreground/10"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {version.notes && (
            <div className="mt-3 pt-3 border-t border-foreground/10">
              <p className="text-sm text-muted-foreground italic">"{version.notes}"</p>
            </div>
          )}
        </div>

        {/* Statistics Card */}
        {hasChanges && (
          <div className="bg-card border border-foreground/10 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t('changeStatistics')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('totalChanges')}</p>
                <p className="text-2xl font-bold text-foreground">
                  {version.changesSummary.totalChanges}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('significantChanges')}</p>
                <p className="text-2xl font-bold text-amber-400">
                  {version.changesSummary.significantChanges.length}
                </p>
              </div>
            </div>
            {version.changesSummary.significantChanges.length > 0 && (
              <div className="mt-3 pt-3 border-t border-foreground/10">
                <p className="text-xs text-muted-foreground mb-2">{t('significantFields')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {version.changesSummary.significantChanges.map((field) => (
                    <span
                      key={field}
                      className="px-2 py-1 text-xs bg-amber-500/10 text-amber-400 rounded border border-amber-500/20"
                    >
                      {formatFieldLabel(field, t)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Field Changes */}
        {hasChanges && (
          <div className="bg-card border border-foreground/10 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t('fieldChanges')}</h3>
            <div className="space-y-3">
              {renderFieldChanges(version.changesSummary, countryCode, t)}
            </div>
          </div>
        )}

        {/* Empty state for no changes */}
        {!hasChanges && version.versionNumber === 1 && (
          <div className="bg-card border border-foreground/10 rounded-lg p-6 text-center">
            <p className="text-muted-foreground text-sm">{t('initialVersionMessage')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Format timestamp for display
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format field name to readable label
 */
function formatFieldLabel(field: string, t: (key: string) => string): string {
  const keyMap: Record<string, string> = {
    revenue: 'fieldLabels.revenue',
    ebitda: 'fieldLabels.ebitda',
    netIncome: 'fieldLabels.netIncome',
    totalAssets: 'fieldLabels.totalAssets',
    totalDebt: 'fieldLabels.totalDebt',
    cash: 'fieldLabels.cash',
    recurringRevenuePercentage: 'fieldLabels.recurringRevenue',
    companyName: 'fieldLabels.companyName',
    foundingYear: 'fieldLabels.foundingYear',
    numberOfEmployees: 'fieldLabels.employees',
    numberOfOwners: 'fieldLabels.owners',
    sharesForSale: 'fieldLabels.sharesForSale',
    businessTypeId: 'fieldLabels.businessTypeId',
    businessType: 'fieldLabels.businessType',
    industry: 'fieldLabels.industry',
    businessModel: 'fieldLabels.businessModel',
    countryCode: 'fieldLabels.country',
  }
  if (keyMap[field]) {
    return t(keyMap[field])
  }
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

/**
 * Format numeric value for display
 */
function formatValue(value: any, field: string, countryCode: string): string {
  if (value === null || value === undefined) return 'N/A'

  // Numeric fields (currency)
  if (['revenue', 'ebitda', 'netIncome', 'totalAssets', 'totalDebt', 'cash'].includes(field)) {
    return formatCurrency(value)
  }

  // Percentage fields
  if (field === 'recurringRevenuePercentage') {
    return `${(value * 100).toFixed(1)}%`
  }

  // Year field
  if (field === 'foundingYear') {
    return value.toString()
  }

  // Count fields
  if (['numberOfEmployees', 'numberOfOwners'].includes(field)) {
    return value.toLocaleString()
  }

  // Percentage fields (0-100)
  if (field === 'sharesForSale') {
    return formatShareholdingPercentage(value)
  }

  // Default string representation
  return String(value)
}

/**
 * Render all field changes
 * CRITICAL: Dynamically render ALL fields that changed, not just a hardcoded list
 */
function renderFieldChanges(changes: any, countryCode: string, t: (key: string) => string) {
  // Get all fields that have changes (excluding summary fields)
  const summaryFields = ['totalChanges', 'significantChanges']
  const changedFields = Object.keys(changes).filter(
    (key) =>
      !summaryFields.includes(key) &&
      changes[key] &&
      typeof changes[key] === 'object' &&
      'from' in changes[key]
  )

  if (changedFields.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-4">
        {t('noFieldChangesDetected')}
      </p>
    )
  }

  // Sort fields: financial first, then business profile, then others
  const fieldOrder: Record<string, number> = {
    revenue: 1,
    ebitda: 2,
    netIncome: 3,
    totalAssets: 4,
    totalDebt: 5,
    cash: 6,
    recurringRevenuePercentage: 7,
    companyName: 10,
    foundingYear: 11,
    numberOfEmployees: 12,
    numberOfOwners: 13,
    sharesForSale: 14,
    businessTypeId: 20,
    businessType: 21,
    industry: 22,
    businessModel: 23,
    countryCode: 24,
  }

  const sortedFields = changedFields.sort((a, b) => {
    const orderA = fieldOrder[a] || 100
    const orderB = fieldOrder[b] || 100
    return orderA - orderB
  })

  return sortedFields.map((field) => {
    const change = changes[field]
    const isSignificant = changes.significantChanges?.includes(field) || false
    return (
      <FieldChangeRow
        key={field}
        field={field}
        change={change}
        countryCode={countryCode}
        isSignificant={isSignificant}
        t={t}
      />
    )
  })
}

/**
 * Field Change Row Component
 */
interface FieldChangeRowProps {
  field: string
  change: {
    from: any
    to: any
    percentChange?: number
  }
  countryCode: string
  isSignificant: boolean
  t: (key: string) => string
}

function FieldChangeRow({ field, change, countryCode, isSignificant, t }: FieldChangeRowProps) {
  const hasPercentChange = change.percentChange !== undefined && change.percentChange !== null
  const isIncrease = hasPercentChange && change.percentChange! > 0
  const isDecrease = hasPercentChange && change.percentChange! < 0

  return (
    <div
      className={`p-3 rounded-lg border ${
        isSignificant ? 'bg-amber-500/5 border-amber-500/20' : 'bg-background border-foreground/10'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="text-sm font-medium text-foreground">{formatFieldLabel(field, t)}</h4>
            {isSignificant && (
              <span className="px-1.5 py-0.5 text-xs bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">
                {t('significantChanges')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {formatValue(change.from, field, countryCode)}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="text-foreground font-medium">
              {formatValue(change.to, field, countryCode)}
            </span>
          </div>
        </div>
        {hasPercentChange && (
          <div
            className={`flex items-center gap-1 text-sm font-medium ${
              isIncrease ? 'text-moss-500' : isDecrease ? 'text-rust-500' : 'text-muted-foreground'
            }`}
          >
            {isIncrease && <ArrowUpRight className="w-4 h-4" />}
            {isDecrease && <ArrowDownRight className="w-4 h-4" />}
            <span>{Math.abs(change.percentChange!).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}
