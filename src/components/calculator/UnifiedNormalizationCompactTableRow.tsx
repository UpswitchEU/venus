'use client'

import { Calendar, Check, CheckSquare, Clock, Edit3, Square, Trash2, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo } from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import type { NormalizationItem, NormalizationSource } from './UnifiedNormalizationTypes'
import { isImportedLedgerNormalizationItem } from './UnifiedNormalizationTypes'

const sourceConfig: Record<NormalizationSource, { labelKey: string; color: string }> = {
  manual: { labelKey: 'sources.manual', color: 'bg-foreground/10 text-foreground/70' },
  yuki: { labelKey: 'sources.yuki', color: 'bg-accent/10 text-accent' },
  exact: { labelKey: 'sources.exact', color: 'bg-info/10 text-info' },
  silverfin: { labelKey: 'sources.silverfin', color: 'bg-indigo-500/10 text-indigo-600' },
  bizzcontrol: { labelKey: 'sources.bizzcontrol', color: 'bg-cyan-500/10 text-cyan-600' },
  odoo: { labelKey: 'sources.odoo', color: 'bg-purple-500/10 text-purple-600' },
  octopus: { labelKey: 'sources.octopus', color: 'bg-blue-500/10 text-blue-600' },
  accountable: { labelKey: 'sources.accountable', color: 'bg-emerald-500/10 text-emerald-600' },
  csv: { labelKey: 'sources.csv', color: 'bg-warning/10 text-warning' },
  ai: { labelKey: 'aiSuggestion', color: 'bg-primary/10 text-primary' },
  auto: { labelKey: 'sources.auto', color: 'bg-success/10 text-success' },
}

// ─────────────────────────────────────────
// COMPACT TABLE ROW COMPONENT
// ─────────────────────────────────────────

interface CompactTableRowProps {
  item: NormalizationItem
  isSelected: boolean
  getLedgerDisplayName: (ledgerCode?: string, ledgerName?: string) => string
  onToggleSelect: () => void
  onAccept: () => void
  onReject: () => void
  onRemove: () => void
  onRestore: () => void
  onEdit: () => void
  hideYear?: boolean
  /** Year-specific EBITDA for recalculating percentage/absolute adjustments */
  yearEbitda?: number
}

export function CompactTableRow({
  item,
  isSelected,
  getLedgerDisplayName,
  onToggleSelect,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
  hideYear = false,
  yearEbitda,
}: CompactTableRowProps) {
  const locale = useLocale()
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const formatCurrency = useCallback(
    (amount: number) => {
      const safe = Number.isFinite(amount) ? amount : 0
      return new Intl.NumberFormat(currencyLocale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe)
    },
    [currencyLocale]
  )
  const ca = useTranslations('chatAssistant')
  const nh = useTranslations('normalizationHub')
  const tCommon = useTranslations('common.actions')
  const sourceBase = sourceConfig[item.source] || sourceConfig.manual
  const isImportedLedger = isImportedLedgerNormalizationItem(item)
  const source = isImportedLedger
    ? {
        labelKey: 'sources.importedLedger' as const,
        color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
      }
    : sourceBase
  const appliedStatusLabel = isImportedLedger ? nh('statusApplied') : nh('statusOk')

  // Recalculate adjustment for percentage/absolute types when year-specific EBITDA is available
  const displayAdjustment = useMemo(() => {
    const stored = Number.isFinite(item.adjustment) ? item.adjustment : 0
    const safeVal = Number.isFinite(item.value) ? item.value : 0
    if (yearEbitda == null) return stored
    // When yearEbitda is 0 or non-finite, recalculation would yield 0/NaN; use stored adjustment
    if (
      (!Number.isFinite(yearEbitda) || yearEbitda === 0) &&
      (item.type === 'add_percent' || item.type === 'subtract_percent' || item.type === 'absolute')
    ) {
      return stored
    }
    if (item.type === 'add_percent') return (yearEbitda * safeVal) / 100
    if (item.type === 'subtract_percent') return -((yearEbitda * safeVal) / 100)
    if (item.type === 'absolute') return safeVal - yearEbitda
    return stored
  }, [item.adjustment, item.type, item.value, yearEbitda])

  // Year display
  const yearDisplay = item.applyAllYears
    ? nh('all')
    : item.applyYears && item.applyYears.length > 0
      ? item.applyYears.length === 1
        ? item.applyYears[0].toString()
        : `${item.applyYears.length} ${nh('yearsShort')}`
      : item.year.toString()

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors group',
        'hover:bg-foreground/[0.02]',
        item.status === 'accepted' && 'bg-success/[0.02]',
        item.status === 'rejected' && 'bg-secondary/[0.02] opacity-60',
        isSelected && 'bg-primary/[0.05] hover:bg-primary/[0.08]'
      )}
    >
      {/* Checkbox */}
      <div className="w-6 flex-shrink-0 pt-0.5">
        <button
          onClick={onToggleSelect}
          className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-foreground/30 group-hover:text-foreground/50" />
          )}
        </button>
      </div>

      {/* Code */}
      <div className="w-16 flex-shrink-0 pt-0.5">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60">
          {item.ledgerCode}
        </span>
      </div>

      {/* Name + Reason — full ledger label visible (wrap); reason still soft-clamped */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={cn('text-sm text-foreground/80', LEDGER_LABEL_TEXT_CLASSES)}
          title={getLedgerDisplayName(item.ledgerCode, item.ledgerName)}
        >
          {getLedgerDisplayName(item.ledgerCode, item.ledgerName)}
        </span>
        {item.reason ? (
          <span
            className={cn('text-xs text-foreground/45', LEDGER_LABEL_TEXT_CLASSES)}
            title={item.reason}
          >
            {item.reason}
          </span>
        ) : null}
      </div>

      {/* Year - conditionally hidden when grouped by year */}
      {!hideYear && (
        <div className="w-20 flex-shrink-0 text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50 tabular-nums">
            <Calendar className="w-2.5 h-2.5" />
            {yearDisplay}
          </span>
        </div>
      )}

      {/* Source */}
      <div className="w-36 flex-shrink-0 text-center self-center">
        <span
          title={isImportedLedger ? nh('importedLedgerTooltip') : undefined}
          className={cn(
            'inline-flex max-w-full items-center justify-center whitespace-normal text-center leading-tight rounded-full px-2.5 py-1 text-[10px] font-medium',
            source.color
          )}
        >
          {nh(source.labelKey)}
        </span>
      </div>

      {/* Status */}
      <div className="w-32 flex-shrink-0 text-center self-center">
        {item.status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-medium text-warning">
            <Clock className="w-2.5 h-2.5" />
            {nh('statusPending')}
          </span>
        )}
        {item.status === 'accepted' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-medium text-success">
            <Check className="w-2.5 h-2.5" />
            {appliedStatusLabel}
          </span>
        )}
        {item.status === 'rejected' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-medium text-secondary">
            <X className="w-2.5 h-2.5" />
            {nh('no')}
          </span>
        )}
      </div>

      {/* Amount */}
      <div className="w-28 flex-shrink-0 text-right self-center">
        <span
          className={cn(
            'text-sm font-mono font-semibold tabular-nums',
            displayAdjustment > 0
              ? 'text-success'
              : displayAdjustment < 0
                ? 'text-secondary'
                : 'text-foreground/40'
          )}
        >
          {displayAdjustment > 0 ? '+' : ''}
          {formatCurrency(displayAdjustment)}
        </span>
      </div>

      {/* Actions - gap-2 for clearer separation between Edit and Delete (accountant UX) */}
      <div className="w-20 flex-shrink-0 flex items-center justify-end gap-2 self-center md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {item.status === 'pending' && (
          <>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('edit')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onReject}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{ca('reject')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onAccept}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-success hover:bg-success/10 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{ca('accept')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          </>
        )}

        {item.status === 'accepted' && (
          <>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('edit')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            {item.source === 'manual' && (
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onRemove}
                      className="p-1.5 rounded-md text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tCommon('delete')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            )}
          </>
        )}

        {item.status === 'rejected' && (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <button
                  onClick={onRestore}
                  className="p-1.5 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{nh('reassess')}</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}
