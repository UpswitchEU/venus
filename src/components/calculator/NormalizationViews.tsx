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
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import React from 'react'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'
import { NormalizationActionButton as ActionButton } from './NormalizationActionButton'
import {
  adjustmentForYear,
  type NormalizationViewProps,
  useNormalizationCategoryLabels,
  useNormalizationCurrencyFormatter,
} from './NormalizationViewModel'

export { NormalizationBentoView } from './NormalizationBentoView'

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
  const formatCurrency = useNormalizationCurrencyFormatter()
  const categoryLabels = useNormalizationCategoryLabels()

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

export default NormalizationTableView
