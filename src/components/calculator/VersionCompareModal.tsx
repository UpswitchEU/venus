'use client'

/**
 * Version Compare Modal
 *
 * World-class Figma/GitHub-inspired diff visualization.
 * Side-by-side comparison of two valuation versions with
 * clear visual indicators for changes.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight,
  ArrowRight,
  Calculator,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Minus,
  RotateCcw,
  Settings2,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AuroraButton, Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system'
import { cn } from '@/design-system/utils'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface VersionChange {
  field: string
  oldValue?: string
  newValue: string
  impact?: number
  sourceRef?: string
}

export interface HistoryVersion {
  id: string
  version: number
  timestamp: Date
  author: string
  authorInitials: string
  type: 'initial' | 'normalization' | 'data_update' | 'methodology' | 'revision'
  summary: string
  changes: VersionChange[]
  valuation?: number
  valuationLow?: number
  valuationHigh?: number
  ebitda?: number
  multiple?: number
  isCurrent?: boolean
}

export interface VersionCompareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versionA: HistoryVersion | null
  versionB: HistoryVersion | null
  onRestore?: (version: HistoryVersion) => void
  onSwap?: () => void
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const typeIcons: Record<HistoryVersion['type'], typeof Clock> = {
  initial: FileText,
  normalization: Settings2,
  data_update: Calculator,
  methodology: TrendingUp,
  revision: User,
}

// ─────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────

function VersionCard({
  version,
  label,
  isOlder,
  comparison,
  typeLabel,
  formatCurrency,
  formatTime,
  t,
}: {
  version: HistoryVersion
  label: string
  isOlder?: boolean
  comparison?: HistoryVersion | null
  typeLabel: string
  formatCurrency: (n: number) => string
  formatTime: (d: Date) => string
  t: (k: string) => string
}) {
  const TypeIcon = typeIcons[version.type]

  // Calculate diff with comparison
  const valuationDiff =
    comparison?.valuation && version.valuation ? version.valuation - comparison.valuation : null
  const ebitdaDiff =
    comparison?.ebitda && version.ebitda ? version.ebitda - comparison.ebitda : null
  const multipleDiff =
    comparison?.multiple && version.multiple ? version.multiple - comparison.multiple : null

  return (
    <div
      className={cn(
        'flex-1 rounded-xl border p-4',
        version.isCurrent
          ? 'border-primary/30 bg-primary/[0.02]'
          : 'border-foreground/[0.08] bg-foreground/[0.02]'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
            isOlder ? 'bg-foreground/[0.08] text-foreground/50' : 'bg-primary/10 text-primary'
          )}
        >
          {label}
        </span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-foreground/[0.06] text-foreground/50">
          {typeLabel}
        </span>
        {version.isCurrent && (
          <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
            {t('current')}
          </span>
        )}
      </div>

      {/* Version Badge */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm',
            version.isCurrent
              ? 'bg-primary text-primary-foreground'
              : 'bg-foreground/[0.08] text-foreground/60'
          )}
        >
          {version.isCurrent ? <Check className="w-5 h-5" /> : `v${version.version}`}
        </div>
        <div>
          <h4 className="text-sm font-medium text-foreground">{version.summary}</h4>
          <p className="text-xs text-foreground/50">
            {version.author} · {formatTime(version.timestamp)}
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      {version.valuation && (
        <div className="space-y-3 p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
          {/* Valuation */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
              Ondernemingswaarde
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold font-mono text-foreground">
                {formatCurrency(version.valuation)}
              </span>
              {valuationDiff !== null && valuationDiff !== 0 && (
                <span
                  className={cn(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5',
                    valuationDiff > 0
                      ? 'text-success bg-success/10'
                      : 'text-secondary bg-secondary/10'
                  )}
                >
                  {valuationDiff > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {valuationDiff > 0 ? '+' : ''}
                  {formatCurrency(valuationDiff)}
                </span>
              )}
            </div>
          </div>

          {/* EBITDA */}
          {version.ebitda && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                EBITDA
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-mono text-foreground/80">
                  {formatCurrency(version.ebitda)}
                </span>
                {ebitdaDiff !== null && ebitdaDiff !== 0 && (
                  <span
                    className={cn(
                      'text-[10px] font-mono px-1.5 py-0.5 rounded',
                      ebitdaDiff > 0
                        ? 'text-success bg-success/10'
                        : 'text-secondary bg-secondary/10'
                    )}
                  >
                    {ebitdaDiff > 0 ? '+' : ''}
                    {formatCurrency(ebitdaDiff)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Multiple */}
          {version.multiple && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Multiple
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-mono text-foreground/80">
                  {version.multiple.toFixed(2)}×
                </span>
                {multipleDiff !== null && multipleDiff !== 0 && (
                  <span
                    className={cn(
                      'text-[10px] font-mono px-1.5 py-0.5 rounded',
                      multipleDiff > 0
                        ? 'text-success bg-success/10'
                        : 'text-secondary bg-secondary/10'
                    )}
                  >
                    {multipleDiff > 0 ? '+' : ''}
                    {multipleDiff.toFixed(2)}×
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Changes List */}
      {version.changes.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
            {t('changes')} ({version.changes.length})
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
            {version.changes.map((change, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-2 rounded-lg bg-foreground/[0.02] border border-foreground/[0.04]"
              >
                <span className="text-foreground/60 truncate flex-1">{change.field}</span>
                <span className="font-mono text-foreground/80 text-[11px]">{change.newValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DiffRow({
  label,
  valueA,
  valueB,
  isImpact,
}: {
  label: string
  valueA?: string
  valueB?: string
  isImpact?: boolean
}) {
  const isDifferent = valueA !== valueB

  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto_1fr] gap-4 py-2.5 px-3 rounded-lg transition-colors',
        isDifferent ? 'bg-warning/[0.03] border border-warning/10' : 'bg-foreground/[0.01]'
      )}
    >
      {/* Old Value */}
      <div className="text-right">
        <span
          className={cn(
            'text-xs font-mono',
            isDifferent ? 'text-foreground/40 line-through' : 'text-foreground/60'
          )}
        >
          {valueA || '—'}
        </span>
      </div>

      {/* Label */}
      <div className="flex items-center justify-center">
        <span className="text-[10px] font-medium text-foreground/50 whitespace-nowrap px-2">
          {label}
        </span>
        {isDifferent && <ChevronRight className="w-3 h-3 text-warning/70" />}
      </div>

      {/* New Value */}
      <div className="text-left">
        <span
          className={cn(
            'text-xs font-mono',
            isDifferent ? 'text-foreground font-medium' : 'text-foreground/60'
          )}
        >
          {valueB || '—'}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

const typeLabelKeys: Record<HistoryVersion['type'], string> = {
  initial: 'typeInitial',
  normalization: 'typeNormalization',
  data_update: 'typeDataUpdate',
  methodology: 'typeMethodology',
  revision: 'typeRevision',
}

export function VersionCompareModal({
  open,
  onOpenChange,
  versionA,
  versionB,
  onRestore,
  onSwap,
}: VersionCompareModalProps) {
  const t = useTranslations('versionCompare')
  const locale = useLocale()
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `€${(amount / 1000000).toFixed(2)}M`
    if (amount >= 1000) return `€${Math.round(amount / 1000)}K`
    return new Intl.NumberFormat(locale === 'nl' ? 'nl-BE' : 'en-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }
  const formatTime = (date: Date) =>
    date.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-BE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (!versionA || !versionB) return null

  // Ensure A is older, B is newer
  const older = versionA.version < versionB.version ? versionA : versionB
  const newer = versionA.version < versionB.version ? versionB : versionA

  const valuationChange = newer.valuation && older.valuation ? newer.valuation - older.valuation : 0
  const percentChange =
    older.valuation && valuationChange ? (valuationChange / older.valuation) * 100 : 0

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <ModalHeader className="p-4 border-b border-foreground/[0.06]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
              </div>
              <div>
                <ModalTitle className="text-base">{t('title')}</ModalTitle>
                <p className="text-xs text-foreground/50 mt-0.5">
                  v{older.version} → v{newer.version}
                </p>
              </div>
            </div>

            {/* Change Summary */}
            <div className="flex items-center gap-4">
              {valuationChange !== 0 && (
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                    valuationChange > 0
                      ? 'bg-success/10 text-success'
                      : 'bg-secondary/10 text-secondary'
                  )}
                >
                  {valuationChange > 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span className="text-sm font-semibold font-mono">
                    {valuationChange > 0 ? '+' : ''}
                    {formatCurrency(valuationChange)}
                  </span>
                  <span className="text-xs opacity-70">
                    ({percentChange > 0 ? '+' : ''}
                    {percentChange.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        </ModalHeader>

        {/* Visual Timeline */}
        <div className="px-4 py-3 bg-foreground/[0.01] border-b border-foreground/[0.06]">
          <div className="flex items-center gap-3">
            {/* Version A Badge */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-foreground/[0.08] flex items-center justify-center text-xs font-semibold text-foreground/60">
                v{older.version}
              </div>
              <span className="text-xs text-foreground/50">{formatTime(older.timestamp)}</span>
            </div>

            {/* Timeline Track */}
            <div className="flex-1 relative h-2">
              <div className="absolute inset-0 bg-foreground/[0.06] rounded-full" />
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-foreground/20 to-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 1 }}
              />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground/30 border-2 border-background" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
            </div>

            {/* Version B Badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground/50">{formatTime(newer.timestamp)}</span>
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold',
                  newer.isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-foreground/[0.08] text-foreground/60'
                )}
              >
                {newer.isCurrent ? <Check className="w-4 h-4" /> : `v${newer.version}`}
              </div>
            </div>
          </div>
        </div>

        {/* Side by Side Comparison */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-4">
            <VersionCard
              version={older}
              label={t('older')}
              isOlder
              comparison={null}
              typeLabel={t(typeLabelKeys[older.type])}
              formatCurrency={formatCurrency}
              formatTime={formatTime}
              t={t}
            />
            <div className="flex items-center">
              <div className="w-px h-full bg-foreground/[0.06]" />
            </div>
            <VersionCard
              version={newer}
              label={t('newer')}
              comparison={older}
              typeLabel={t(typeLabelKeys[newer.type])}
              formatCurrency={formatCurrency}
              formatTime={formatTime}
              t={t}
            />
          </div>

          {/* Detailed Diff Table */}
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t('comparisonDetails')}</h3>
            <div className="space-y-1">
              <DiffRow
                label={t('enterpriseValue')}
                valueA={older.valuation ? formatCurrency(older.valuation) : undefined}
                valueB={newer.valuation ? formatCurrency(newer.valuation) : undefined}
              />
              <DiffRow
                label={t('ebitda')}
                valueA={older.ebitda ? formatCurrency(older.ebitda) : undefined}
                valueB={newer.ebitda ? formatCurrency(newer.ebitda) : undefined}
              />
              <DiffRow
                label={t('multiple')}
                valueA={older.multiple ? `${older.multiple.toFixed(2)}×` : undefined}
                valueB={newer.multiple ? `${newer.multiple.toFixed(2)}×` : undefined}
              />
              {older.valuationLow && newer.valuationLow && (
                <DiffRow
                  label={t('bandwidth')}
                  valueA={`${formatCurrency(older.valuationLow)} — ${formatCurrency(older.valuationHigh || 0)}`}
                  valueB={`${formatCurrency(newer.valuationLow)} — ${formatCurrency(newer.valuationHigh || 0)}`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 px-4 py-3 border-t border-foreground/[0.06] bg-foreground/[0.01]">
          <div className="flex items-center justify-between">
            <AuroraButton
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-foreground/60"
            >
              {t('close')}
            </AuroraButton>

            <div className="flex items-center gap-2">
              {onSwap && (
                <AuroraButton variant="outline" size="sm" onClick={onSwap} className="gap-1.5">
                  <ArrowLeftRight className="w-4 h-4" />
                  {t('swap')}
                </AuroraButton>
              )}
              {onRestore && !newer.isCurrent && (
                <AuroraButton size="sm" onClick={() => onRestore(newer)} className="gap-1.5">
                  <RotateCcw className="w-4 h-4" />
                  {t('restoreTo', { version: newer.version })}
                </AuroraButton>
              )}
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}
