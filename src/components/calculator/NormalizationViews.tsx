'use client'

/**
 * Normalization Views - Table & Bento Grid
 *
 * World-class financial data visualization:
 * - Table: Professional ledger view with horizontal year columns
 * - Bento Grid: Premium card-based layout with glassmorphism
 *
 * Design: Stripe/Klarna tier (95%+ design quality)
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  Edit3,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import React from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { AuroraButton as Button } from '@/design-system/components/Button'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import { cn } from '@/design-system/utils'
import {
  isImportedLedgerNormalizationItem,
  type NormalizationItem,
  type NormalizationSource,
} from './UnifiedNormalizationTypes'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

interface NormalizationViewProps {
  items: NormalizationItem[]
  years: number[]
  originalEBITDA: number
  /** Per-year reported EBITDA for accurate multi-year display */
  originalEBITDAByYear?: Record<number, number>
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  onEdit: (item: NormalizationItem) => void
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const categoryIcons: Record<string, string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
  depreciation: '📉',
  other: '📋',
}

const sourceColors: Record<NormalizationSource, string> = {
  manual: 'bg-foreground/10 text-foreground/70',
  yuki: 'bg-accent/10 text-accent',
  exact: 'bg-info/10 text-info',
  silverfin: 'bg-indigo-500/10 text-indigo-600',
  bizzcontrol: 'bg-cyan-500/10 text-cyan-600',
  odoo: 'bg-purple-500/10 text-purple-600',
  octopus: 'bg-blue-500/10 text-blue-600',
  accountable: 'bg-emerald-500/10 text-emerald-600',
  csv: 'bg-warning/10 text-warning',
  ai: 'bg-primary/10 text-primary',
  auto: 'bg-success/10 text-success',
}

/**
 * Recalculate adjustment for a normalization item in the context of a specific year.
 * Percentage and absolute types must use the year-specific EBITDA, not the stored amount.
 */
function adjustmentForYear(
  item: NormalizationItem,
  year: number,
  originalEBITDA: number,
  originalEBITDAByYear?: Record<number, number>
): number {
  const yearEbitda = originalEBITDAByYear?.[year] ?? originalEBITDA
  const stored = Number.isFinite(item.adjustment) ? item.adjustment : 0
  const safeVal = Number.isFinite(item.value) ? item.value : 0
  // When yearEbitda is 0 or non-finite, percentage/absolute recalculation yields wrong result; use stored
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
}

// ─────────────────────────────────────────
// PROFESSIONAL TABLE VIEW
// Multi-year horizontal layout with financial precision
// ─────────────────────────────────────────

export function NormalizationTableView({
  items,
  years,
  originalEBITDA,
  originalEBITDAByYear,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
}: NormalizationViewProps) {
  const t = useTranslations('normalizationHub')
  const locale = useLocale()
  const formatCurrency = React.useCallback(
    (value: number) => {
      const safe = Number.isFinite(value) ? value : 0
      return new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe)
    },
    [locale]
  )
  const categoryLabels = React.useMemo(
    () =>
      ({
        salary: {
          label: t('categories.salary'),
          icon: categoryIcons.salary,
          group: 'kosten' as const,
        },
        rent: { label: t('categories.rent'), icon: categoryIcons.rent, group: 'kosten' as const },
        vehicle: {
          label: t('categories.vehicle'),
          icon: categoryIcons.vehicle,
          group: 'kosten' as const,
        },
        'one-time': {
          label: t('categories.oneTime'),
          icon: categoryIcons['one-time'],
          group: 'kosten' as const,
        },
        personal: {
          label: t('categories.personal'),
          icon: categoryIcons.personal,
          group: 'kosten' as const,
        },
        depreciation: {
          label: t('categories.depreciation'),
          icon: categoryIcons.depreciation,
          group: 'kosten' as const,
        },
        other: {
          label: t('categories.other'),
          icon: categoryIcons.other,
          group: 'kosten' as const,
        },
      }) as Record<string, { label: string; icon: string; group: 'omzet' | 'kosten' }>,
    [t]
  )

  // Show each normalization as its own row, sorted by ledger code
  const rowItems = React.useMemo(() => {
    return [...items].sort((a, b) => a.ledgerCode.localeCompare(b.ledgerCode))
  }, [items])

  // Calculate totals per year using year-specific EBITDA when available
  const yearTotals = React.useMemo(() => {
    const totals: Record<number, { reported: number; adjustment: number; normalized: number }> = {}
    years.forEach((year) => {
      const yearItems = items.filter(
        (item) =>
          item.status === 'accepted' &&
          (item.applyAllYears || (item.applyYears || [item.year]).includes(year))
      )
      const rawAdj = yearItems.reduce(
        (sum, item) => sum + adjustmentForYear(item, year, originalEBITDA, originalEBITDAByYear),
        0
      )
      const adjustment = Number.isFinite(rawAdj) ? rawAdj : 0
      const rawReported = originalEBITDAByYear?.[year] ?? originalEBITDA
      const reported = Number.isFinite(rawReported) ? rawReported : 0
      totals[year] = {
        reported,
        adjustment,
        normalized: reported + adjustment,
      }
    })
    return totals
  }, [items, years, originalEBITDA, originalEBITDAByYear])

  if (rowItems.length === 0) {
    return null
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-foreground/[0.08] bg-card [-webkit-overflow-scrolling:touch]">
      <table
        className="text-sm border-collapse"
        style={{ minWidth: `${520 + years.length * 120}px` }}
      >
        {/* Header */}
        <thead>
          <tr className="border-b border-foreground/[0.1] bg-muted/50">
            {/* Fixed columns - left section */}
            <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-foreground/60 w-20 whitespace-nowrap border-r border-foreground/[0.06]">
              {t('table.soort')}
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-foreground/60 w-24 whitespace-nowrap">
              {t('table.code')}
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-foreground/60 min-w-[min(28rem,85vw)] align-top border-r border-foreground/[0.08]">
              {t('table.grootboekrekening')}
            </th>
            {/* Year columns - one column per year showing the adjustment */}
            {years.map((year, idx) => (
              <th
                key={year}
                className={cn(
                  'px-3 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider min-w-[100px] whitespace-nowrap text-foreground/70',
                  idx > 0 && 'border-l border-foreground/[0.08]'
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-primary/60" />
                  <span className="text-xs">{year}</span>
                </div>
              </th>
            ))}
            <th className="px-4 py-3.5 text-center text-[10px] font-semibold uppercase tracking-wider text-foreground/60 w-28 whitespace-nowrap border-l border-foreground/[0.08]">
              {t('table.acties')}
            </th>
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          <AnimatePresence mode="popLayout">
            {rowItems.map((item, index) => {
              const cat = categoryLabels[item.category] || categoryLabels.other
              const isAccepted = item.status === 'accepted'

              return (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: index * 0.02 }}
                  className="border-b border-foreground/[0.05] hover:bg-muted/40 group transition-colors"
                >
                  {/* Soort */}
                  <td className="px-4 py-4 whitespace-nowrap border-r border-foreground/[0.06]">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold',
                        cat.group === 'kosten'
                          ? 'bg-secondary/10 text-secondary'
                          : 'bg-success/10 text-success'
                      )}
                    >
                      {cat.icon}
                      <span className="hidden xl:inline">
                        {cat.group === 'kosten' ? t('groups.kosten') : t('groups.omzet')}
                      </span>
                    </span>
                  </td>

                  {/* Code */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-foreground/[0.06] text-foreground font-semibold">
                      {item.ledgerCode}
                    </span>
                  </td>

                  {/* Grootboekrekening — wide min-width + no max-width cap so long ledger labels stay fully readable */}
                  <td className="px-4 py-4 align-top border-r border-foreground/[0.08] min-w-[min(28rem,85vw)]">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span
                        className={cn('font-medium text-foreground', LEDGER_LABEL_TEXT_CLASSES)}
                        title={item.ledgerName}
                      >
                        {item.ledgerName}
                      </span>
                      {item.reason && (
                        <span
                          className={cn(
                            'text-[11px] text-foreground/50',
                            LEDGER_LABEL_TEXT_CLASSES
                          )}
                          title={item.reason}
                        >
                          {item.reason}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Year columns - show adjustment per year */}
                  {years.map((year, idx) => {
                    const appliesThisYear =
                      item.applyAllYears || (item.applyYears || [item.year]).includes(year)
                    const adjustment = adjustmentForYear(
                      item,
                      year,
                      originalEBITDA,
                      originalEBITDAByYear
                    )

                    return (
                      <td
                        key={year}
                        className={cn(
                          'px-3 py-4 text-right whitespace-nowrap',
                          idx > 0 && 'border-l border-foreground/[0.08]',
                          !appliesThisYear && 'text-foreground/20'
                        )}
                      >
                        {appliesThisYear ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums',
                              adjustment > 0
                                ? 'text-success'
                                : adjustment < 0
                                  ? 'text-secondary'
                                  : 'text-foreground/40',
                              !isAccepted && 'opacity-40 line-through'
                            )}
                          >
                            {adjustment > 0 ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : adjustment < 0 ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : null}
                            {adjustment > 0 ? '+' : ''}
                            {formatCurrency(adjustment)}
                          </span>
                        ) : (
                          <span className="font-mono text-xs tabular-nums text-foreground/20">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}

                  {/* Actions */}
                  <td className="px-4 py-4 whitespace-nowrap border-l border-foreground/[0.08]">
                    <div className="flex items-center justify-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                      {item.status === 'pending' && (
                        <>
                          <ActionButton
                            icon={Edit3}
                            tooltip={t('actions.edit')}
                            onClick={() => onEdit(item)}
                            color="primary"
                          />
                          <ActionButton
                            icon={X}
                            tooltip={t('actions.reject')}
                            onClick={() => onReject(item.id)}
                            color="secondary"
                          />
                          <ActionButton
                            icon={Check}
                            tooltip={t('actions.accept')}
                            onClick={() => onAccept(item.id)}
                            color="success"
                          />
                        </>
                      )}
                      {item.status === 'accepted' && (
                        <>
                          <ActionButton
                            icon={Edit3}
                            tooltip={t('actions.edit')}
                            onClick={() => onEdit(item)}
                            color="primary"
                          />
                          {item.source === 'manual' && (
                            <ActionButton
                              icon={Trash2}
                              tooltip={t('actions.remove')}
                              onClick={() => onRemove(item.id)}
                              color="secondary"
                            />
                          )}
                        </>
                      )}
                      {item.status === 'rejected' && (
                        <ActionButton
                          icon={Clock}
                          tooltip={t('actions.restore')}
                          onClick={() => onRestore(item.id)}
                          color="muted"
                        />
                      )}
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </AnimatePresence>
        </tbody>

        {/* Footer - EBITDA totals with Geboekt / Correctie / Genormaliseerd */}
        <tfoot>
          <tr className="border-t-2 border-foreground/[0.12] bg-muted/60">
            <td colSpan={3} className="px-4 py-3.5 border-r border-foreground/[0.08]">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                {t('footer.ebitdaTotal')}
              </span>
            </td>
            {years.map((year, idx) => {
              const yt = yearTotals[year]
              return (
                <td
                  key={year}
                  className={cn(
                    'px-3 py-3.5 text-right whitespace-nowrap',
                    idx > 0 && 'border-l border-foreground/[0.08]'
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[9px] text-foreground/40 uppercase">
                        {t('footer.geboekt')}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground/50">
                        {formatCurrency(yt.reported)}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[9px] text-foreground/40 uppercase">
                        {t('footer.correctie')}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-xs font-bold tabular-nums',
                          yt.adjustment > 0
                            ? 'text-success'
                            : yt.adjustment < 0
                              ? 'text-secondary'
                              : 'text-foreground/40'
                        )}
                      >
                        {yt.adjustment > 0 ? '+' : ''}
                        {formatCurrency(yt.adjustment)}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-foreground/[0.08]">
                      <span className="text-[9px] text-primary uppercase font-semibold">
                        {t('footer.genorm')}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                        {formatCurrency(yt.normalized)}
                      </span>
                    </div>
                  </div>
                </td>
              )
            })}
            <td className="px-4 py-3.5 border-l border-foreground/[0.08]" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────
// BENTO GRID VIEW
// Premium glassmorphism cards with staggered animations
// ─────────────────────────────────────────

export function NormalizationBentoView({
  items,
  years,
  originalEBITDA,
  originalEBITDAByYear,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
}: NormalizationViewProps) {
  const t = useTranslations('normalizationHub')
  const locale = useLocale()
  const formatCurrency = React.useCallback(
    (value: number) => {
      const safe = Number.isFinite(value) ? value : 0
      return new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe)
    },
    [locale]
  )
  const categoryLabels = React.useMemo(
    () =>
      ({
        salary: {
          label: t('categories.salary'),
          icon: categoryIcons.salary,
          group: 'kosten' as const,
        },
        rent: { label: t('categories.rent'), icon: categoryIcons.rent, group: 'kosten' as const },
        vehicle: {
          label: t('categories.vehicle'),
          icon: categoryIcons.vehicle,
          group: 'kosten' as const,
        },
        'one-time': {
          label: t('categories.oneTime'),
          icon: categoryIcons['one-time'],
          group: 'kosten' as const,
        },
        personal: {
          label: t('categories.personal'),
          icon: categoryIcons.personal,
          group: 'kosten' as const,
        },
        depreciation: {
          label: t('categories.depreciation'),
          icon: categoryIcons.depreciation,
          group: 'kosten' as const,
        },
        other: {
          label: t('categories.other'),
          icon: categoryIcons.other,
          group: 'kosten' as const,
        },
      }) as Record<string, { label: string; icon: string; group: 'omzet' | 'kosten' }>,
    [t]
  )
  const sourceConfig = React.useMemo(
    () =>
      ({
        manual: { label: t('sources.manual'), color: sourceColors.manual },
        yuki: { label: t('sources.yuki'), color: sourceColors.yuki },
        exact: { label: t('sources.exact'), color: sourceColors.exact },
        silverfin: { label: t('sources.silverfin'), color: sourceColors.silverfin },
        bizzcontrol: { label: t('sources.bizzcontrol'), color: sourceColors.bizzcontrol },
        odoo: { label: t('sources.odoo'), color: sourceColors.odoo },
        octopus: { label: t('sources.octopus'), color: sourceColors.octopus },
        accountable: { label: t('sources.accountable'), color: sourceColors.accountable },
        csv: { label: t('sources.csv'), color: sourceColors.csv },
        ai: { label: t('sources.ai'), color: sourceColors.ai },
        auto: { label: t('sources.auto'), color: sourceColors.auto },
      }) as Record<NormalizationSource, { label: string; color: string }>,
    [t]
  )

  if (items.length === 0) {
    return null
  }

  return (
    <div className="pt-2">
      {/* Bento Grid of Cards - totals already shown in modal header */}
      <div className="grid grid-cols-12 gap-4">
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => {
            const cat = categoryLabels[item.category] || categoryLabels.other
            const baseSource = sourceConfig[item.source] || sourceConfig.manual
            const source = isImportedLedgerNormalizationItem(item)
              ? {
                  label: t('sources.importedLedger'),
                  color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
                }
              : baseSource

            // Recalculate adjustment for % and absolute types using most recent year
            const displayYear = item.applyYears?.[0] ?? item.year ?? years[0]
            const displayAdj = adjustmentForYear(
              item,
              displayYear,
              originalEBITDA,
              originalEBITDAByYear
            )
            const magnitude = Math.abs(displayAdj)
            const isLarge = magnitude > 50000
            const colSpan = isLarge
              ? 'col-span-12 md:col-span-6'
              : 'col-span-12 md:col-span-6 lg:col-span-4'

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.03, type: 'spring', stiffness: 200, damping: 25 }}
                className={cn(
                  colSpan,
                  'group relative overflow-hidden rounded-xl transition-all duration-300',
                  'bg-card/80 backdrop-blur-lg border hover:translate-y-[-2px]',
                  item.status === 'pending' &&
                    'border-foreground/[0.08] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
                  item.status === 'accepted' &&
                    'border-success/20 bg-success/[0.02] hover:border-success/40 hover:shadow-lg hover:shadow-success/5',
                  item.status === 'rejected' && 'border-secondary/20 bg-secondary/[0.02] opacity-60'
                )}
              >
                {/* Status indicator bar */}
                <div
                  className={cn(
                    'absolute top-0 left-0 right-0 h-0.5',
                    item.status === 'pending' &&
                      'bg-gradient-to-r from-warning/20 via-warning/30 to-transparent',
                    item.status === 'accepted' &&
                      'bg-gradient-to-r from-success/50 via-success/30 to-transparent',
                    item.status === 'rejected' &&
                      'bg-gradient-to-r from-secondary/50 via-secondary/30 to-transparent'
                  )}
                />

                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center text-lg',
                          item.status === 'accepted' ? 'bg-success/10' : 'bg-foreground/[0.05]'
                        )}
                      >
                        {cat.icon}
                      </div>
                      <div className="min-w-0 flex-1 max-w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.08] text-foreground/60">
                            {item.ledgerCode}
                          </span>
                          <span
                            title={
                              isImportedLedgerNormalizationItem(item)
                                ? t('importedLedgerTooltip')
                                : undefined
                            }
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[9px] font-medium',
                              source.color
                            )}
                          >
                            {source.label}
                          </span>
                        </div>
                        <p
                          className={cn(
                            'text-sm font-medium text-foreground/80 mt-1',
                            LEDGER_LABEL_TEXT_CLASSES
                          )}
                          title={item.ledgerName}
                        >
                          {item.ledgerName}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {item.status === 'pending' && (
                        <>
                          <ActionButton
                            icon={Edit3}
                            tooltip={t('actions.edit')}
                            onClick={() => onEdit(item)}
                            color="primary"
                            size="sm"
                          />
                          <ActionButton
                            icon={X}
                            tooltip={t('actions.reject')}
                            onClick={() => onReject(item.id)}
                            color="secondary"
                            size="sm"
                          />
                          <ActionButton
                            icon={Check}
                            tooltip={t('actions.accept')}
                            onClick={() => onAccept(item.id)}
                            color="success"
                            size="sm"
                          />
                        </>
                      )}
                      {item.status === 'accepted' && (
                        <>
                          <ActionButton
                            icon={Edit3}
                            tooltip={t('actions.edit')}
                            onClick={() => onEdit(item)}
                            color="primary"
                            size="sm"
                          />
                          {item.source === 'manual' && (
                            <ActionButton
                              icon={Trash2}
                              tooltip={t('actions.remove')}
                              onClick={() => onRemove(item.id)}
                              color="secondary"
                              size="sm"
                            />
                          )}
                        </>
                      )}
                      {item.status === 'rejected' && (
                        <ActionButton
                          icon={Clock}
                          tooltip={t('actions.restore')}
                          onClick={() => onRestore(item.id)}
                          color="muted"
                          size="sm"
                        />
                      )}
                    </div>
                  </div>

                  {/* Value Display */}
                  <div className="flex items-end justify-between mt-4 pt-3 border-t border-foreground/[0.06]">
                    <div className="flex items-center gap-2">
                      {displayAdj > 0 ? (
                        <TrendingUp className="w-4 h-4 text-success" />
                      ) : displayAdj < 0 ? (
                        <TrendingDown className="w-4 h-4 text-secondary" />
                      ) : null}
                      <span
                        className={cn(
                          'text-xl font-bold font-mono tabular-nums',
                          displayAdj > 0
                            ? 'text-success'
                            : displayAdj < 0
                              ? 'text-secondary'
                              : 'text-foreground/40'
                        )}
                      >
                        {displayAdj > 0 ? '+' : ''}
                        {formatCurrency(displayAdj)}
                      </span>
                    </div>

                    {/* Year badges */}
                    <div className="flex gap-1">
                      {item.applyAllYears ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary tabular-nums">
                          {t('all')}
                        </span>
                      ) : (
                        <>
                          {(item.applyYears || [item.year]).slice(0, 3).map((year) => (
                            <span
                              key={year}
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-foreground/[0.06] text-foreground/50 tabular-nums"
                            >
                              {year}
                            </span>
                          ))}
                          {(item.applyYears || []).length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-foreground/[0.06] text-foreground/50">
                              +{(item.applyYears?.length || 0) - 3}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reason */}
                  {item.reason && (
                    <p
                      className={cn('text-xs text-foreground/40 mt-2', LEDGER_LABEL_TEXT_CLASSES)}
                      title={item.reason}
                    >
                      {item.reason}
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// ACTION BUTTON COMPONENT
// ─────────────────────────────────────────

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  onClick: () => void
  color: 'primary' | 'secondary' | 'success' | 'muted'
  size?: 'sm' | 'md'
}

function ActionButton({ icon: Icon, tooltip, onClick, color, size = 'md' }: ActionButtonProps) {
  const colorClasses = {
    primary: 'hover:text-primary hover:bg-primary/10',
    secondary: 'hover:text-secondary hover:bg-secondary/10',
    success: 'hover:text-success hover:bg-success/10',
    muted: 'hover:text-foreground/70 hover:bg-foreground/10',
  }

  const sizeClasses = {
    sm: 'p-1 rounded-md',
    md: 'p-1.5 rounded-lg',
  }

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            className={cn(
              'text-foreground/40 transition-colors',
              sizeClasses[size],
              colorClasses[color]
            )}
          >
            <Icon className={iconSizeClasses[size]} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export default NormalizationTableView
