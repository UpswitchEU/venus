'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { compareOmniMethodKeys } from '@/constants/omniCalcMethods'
import { cn } from '@/design-system/utils'
import {
  getValuationMethodResultForKey,
  hydratedRevenueMethodKeysAreSameRef,
} from '@/utils/extractValuationResultsMap'
import { parseFinancialTransportNumber } from '@/utils/financialTransport'
import {
  formatMethodAmount,
  methodComparisonDelta,
  resolveMethodCurrency,
  resolveMethodValueBasis,
} from '@/utils/methodComparisonFinancials'
import type { ValuationMethodResult } from '../../../types/valuation'
import { getOmniMethodRange } from '../../../utils/omniCalcRange'

interface OmniMethodPanoramaProps {
  currency?: string | null
  locale?: string
  valuationResults: Record<string, ValuationMethodResult>
  selectedMethod: string
  pendingMethod?: string | null
  methodSelectionLocked?: boolean
  onMethodClick: (key: string) => void
  className?: string
  /** When set to NL, Belgian-only fiscal reference method is hidden (matches Titan/PDF gating). */
  firmCountryCode?: string | null
  /** Opens upgrade / method paywall when user taps a plan-gated teaser row. */
  onPlanLockedMethodClick?: () => void
  /**
   * Comparables stats from `result.multiples_valuation`. Used to render an
   * inline `n=32 · medium` chip on multiple-driven rows so the preparer can
   * judge data confidence at a glance, without clicking into the row to
   * see the breakdown card. The panorama is read-only here — sourcing this
   * once at the modal level keeps every row consistent.
   */
  comparablesCount?: number | null
  comparablesQuality?: string | null
}

const formatMultiple = (value: number | null) => (value == null ? null : `${value.toFixed(2)}×`)

const formatPercent = (value: number | null, scale = 1) =>
  value == null ? null : `${(value * scale).toFixed(1)}%`

export function OmniMethodPanorama({
  currency,
  locale = 'en',
  valuationResults,
  selectedMethod,
  pendingMethod = null,
  methodSelectionLocked = false,
  onMethodClick,
  className,
  firmCountryCode,
  onPlanLockedMethodClick,
  comparablesCount,
  comparablesQuality,
}: OmniMethodPanoramaProps) {
  const t = useTranslations('omniCalc')
  const tBreakdown = useTranslations('methodBreakdown')

  // Methods anchored on a peer-set median (the chip below applies only to
  // these — other methods don't have a comparables sample in the same sense).
  const MULTIPLE_DRIVEN_KEYS = new Set([
    'ebitda_multiple',
    'omzet_multiple',
    'revenue_multiple',
    'sde_multiple',
    'arr_multiple',
  ])
  const comparablesQualityKey = (() => {
    const q = (comparablesQuality ?? '').toLowerCase().trim()
    if (q === 'high' || q === 'very_high') return 'comparablesQualityValues.high'
    if (q === 'medium' || q === 'moderate') return 'comparablesQualityValues.medium'
    if (q === 'low' || q === 'very_low') return 'comparablesQualityValues.low'
    return null
  })()
  const hasComparablesChip =
    comparablesCount != null && comparablesCount > 0 && comparablesQualityKey != null

  const hideFiscalForNl = firmCountryCode?.trim().toUpperCase().substring(0, 2) === 'NL'

  const sortedMethodEntries = useMemo(() => {
    const entries = Object.entries(valuationResults)
    const hideDuplicateRevenueAlias = hydratedRevenueMethodKeysAreSameRef(valuationResults)

    const filtered = entries.filter(([key]) => {
      if (hideFiscalForNl && key === 'fiscal_4x') return false
      // Hydration aliases both keys to the same row; show a single panorama row (prefer omzet label slot).
      if (hideDuplicateRevenueAlias && key === 'revenue_multiple') return false
      return true
    })
    return filtered.sort(([a], [b]) => compareOmniMethodKeys(a, b))
  }, [valuationResults, hideFiscalForNl])

  const adaptive = getValuationMethodResultForKey(valuationResults, 'upswitch_adaptive')
  if (sortedMethodEntries.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div className="space-y-1">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
            {t('methodsPanoramaTitle')}
          </h5>
          <p className="sr-only">{t('columnHintMobile')}</p>
        </div>
        <div
          className="hidden sm:grid sm:grid-cols-[5.5rem_3.5rem_4.25rem] gap-3 text-right text-[9px] font-medium uppercase tracking-wide text-foreground/35 shrink-0"
          aria-hidden
        >
          <span>{t('columnValue')}</span>
          <span>{t('columnMultiple')}</span>
          <span className="whitespace-nowrap">{t('columnDelta')}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {sortedMethodEntries.map(([key, method]) => {
          const isPlanTeaser = method.plan_teaser === true
          const isSelected = key === selectedMethod
          const isPending = key === pendingMethod
          const value = parseFinancialTransportNumber(method.value) ?? null
          const isAvailable = method.available && value !== null
          const methodCurrency = resolveMethodCurrency(method, currency)
          const basis = resolveMethodValueBasis(method)
          const formatCurrency = (amount: number) =>
            formatMethodAmount(amount, methodCurrency, locale)
          const range =
            isAvailable && basis ? getOmniMethodRange({ ...method, value_basis: basis }) : null
          const multiple = parseFinancialTransportNumber(method.multiple_used) ?? null
          const wacc = parseFinancialTransportNumber(method.wacc) ?? null
          const metric =
            isAvailable && !isPlanTeaser
              ? multiple !== null
                ? formatMultiple(multiple)
                : wacc !== null
                  ? `${tBreakdown('wacc')} ${formatPercent(wacc, 100)}`
                  : null
              : null
          const delta =
            key !== 'upswitch_adaptive' ? methodComparisonDelta(method, adaptive, currency) : null
          const deltaValue = delta?.amount ?? null
          const deltaPercent = delta?.percent ?? null
          const maxComparisonValue = sortedMethodEntries.reduce((max, [, candidate]) => {
            const candidateValue = parseFinancialTransportNumber(candidate.value)
            if (
              !candidate.available ||
              candidate.plan_teaser ||
              candidateValue === undefined ||
              methodCurrency === null ||
              basis === null ||
              resolveMethodCurrency(candidate, currency) !== methodCurrency ||
              resolveMethodValueBasis(candidate) !== basis
            )
              return max
            return Math.max(max, candidateValue)
          }, 0)
          const barWidth =
            maxComparisonValue > 0 && value !== null && value > 0
              ? `${(value / maxComparisonValue) * 100}%`
              : '0%'

          const msg = t(`methodDescriptions.${key}` as never)
          const descriptionEl =
            typeof msg === 'string' &&
            msg.length > 0 &&
            msg !== `methodDescriptions.${key}` &&
            !msg.startsWith('methodDescriptions.') ? (
              <p className="text-[10px] text-foreground/45 mt-1 leading-snug line-clamp-2">{msg}</p>
            ) : null

          return (
            <button
              key={key}
              type="button"
              disabled={methodSelectionLocked || (!isPlanTeaser && !isAvailable)}
              aria-pressed={isSelected}
              aria-label={
                isPlanTeaser
                  ? `${method.label} — ${t('planTeaserHint')}`
                  : isSelected
                    ? `${method.label}, ${t('selected')}`
                    : method.label
              }
              onClick={() => {
                if (methodSelectionLocked) return
                if (isPlanTeaser) {
                  onPlanLockedMethodClick?.()
                  return
                }
                if (isAvailable) onMethodClick(key)
              }}
              className={cn(
                'w-full text-left rounded-xl border px-3 py-3 sm:px-3.5 sm:py-3 transition-all duration-200',
                'focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:outline-none focus-visible:ring-offset-background',
                isPlanTeaser
                  ? 'border-amber-500/25 bg-amber-500/[0.04] cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/[0.07]'
                  : isSelected
                    ? 'border-primary/45 bg-primary/[0.07] ring-1 ring-primary/15'
                    : isPending
                      ? 'border-primary/35 bg-primary/[0.04] ring-1 ring-primary/20'
                      : isAvailable
                        ? 'border-foreground/[0.08] bg-background/40 hover:border-primary/25 hover:bg-primary/[0.03]'
                        : 'border-border/30 bg-background/30 opacity-[0.85] cursor-not-allowed'
              )}
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'text-sm font-semibold tracking-tight',
                          isSelected || isPending ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {method.label}
                      </span>
                      {isPlanTeaser && (
                        <span className="shrink-0 inline-flex items-center text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25">
                          {t('planTeaserBadge')}
                        </span>
                      )}
                      {isSelected && !isPlanTeaser && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/12 px-2 py-0.5 rounded-full border border-primary/15">
                          <Check className="w-2.5 h-2.5" aria-hidden />
                          {t('selected')}
                        </span>
                      )}
                      {/* Comparables chip — `n=32 · medium`. Only on multiple-
                          driven rows where a peer-set sample exists; skipped on
                          plan teasers (no real numbers behind the row). */}
                      {hasComparablesChip && !isPlanTeaser && MULTIPLE_DRIVEN_KEYS.has(key) && (
                        <span
                          className="shrink-0 inline-flex items-center gap-1 text-[9px] font-mono tabular-nums text-foreground/55 bg-foreground/[0.04] px-1.5 py-0.5 rounded-full border border-foreground/[0.08]"
                          title={`${comparablesCount} comparables · ${tBreakdown(comparablesQualityKey as never)}`}
                        >
                          n={comparablesCount} · {tBreakdown(comparablesQualityKey as never)}
                        </span>
                      )}
                    </div>

                    {isPlanTeaser && (
                      <p className="text-[10px] text-amber-800/90 dark:text-amber-200/90 leading-snug">
                        {t('planTeaserHint')}
                      </p>
                    )}

                    {!isAvailable && !isPlanTeaser && method.unavailable_reason && (
                      <p className="text-[10px] text-foreground/45 leading-snug">
                        {method.unavailable_reason}
                      </p>
                    )}

                    {descriptionEl}
                  </div>

                  <div
                    className={cn(
                      'flex flex-wrap items-start justify-end gap-x-4 gap-y-2 sm:gap-x-6 shrink-0',
                      isPlanTeaser && 'blur-[2px] opacity-60 select-none'
                    )}
                  >
                    <div className="text-right min-w-[5.5rem]">
                      {isAvailable && value != null && !isPlanTeaser ? (
                        <>
                          <span
                            className={cn(
                              'text-base font-mono font-semibold tabular-nums tracking-tight',
                              isSelected || isPending ? 'text-primary' : 'text-foreground'
                            )}
                          >
                            {formatCurrency(value)}
                          </span>
                          <span className="block text-[10px] text-foreground/45">
                            {basis === 'enterprise_value'
                              ? tBreakdown('enterpriseValue')
                              : basis === 'equity_value'
                                ? tBreakdown('equityValue')
                                : t('valueBasisUnknown')}
                            {methodCurrency === null ? ` · ${t('currencyUnknown')}` : ''}
                          </span>
                          {range && (
                            <>
                              <span className="block text-[10px] text-foreground/40 tabular-nums mt-0.5">
                                {formatCurrency(range.low)} – {formatCurrency(range.high)}
                              </span>
                              <span className="block text-[9px] text-foreground/25 uppercase tracking-wide">
                                {range.source === 'model'
                                  ? t('rangeModel')
                                  : t('rangeIllustrative')}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-foreground/30 font-mono tabular-nums">
                          {isPlanTeaser ? '•••' : '—'}
                        </span>
                      )}
                    </div>

                    <div className="text-right min-w-[3.5rem]">
                      {metric && !isPlanTeaser ? (
                        <span className="text-sm font-mono font-semibold tabular-nums text-foreground/80">
                          {metric}
                        </span>
                      ) : (
                        <span className="text-sm text-foreground/30 font-mono">
                          {isPlanTeaser ? '•••' : '—'}
                        </span>
                      )}
                    </div>

                    <div className="text-right min-w-[3.75rem] sm:min-w-[4.25rem]">
                      {key === 'upswitch_adaptive' && isAvailable && !isPlanTeaser ? (
                        <span className="text-[11px] font-medium text-foreground/45 tabular-nums">
                          {t('adaptiveBaselineLabel')}
                        </span>
                      ) : !isPlanTeaser && deltaValue != null ? (
                        <div className="space-y-0.5">
                          <p
                            className={cn(
                              'text-sm font-mono font-semibold tabular-nums',
                              deltaValue >= 0 ? 'text-success' : 'text-warning'
                            )}
                          >
                            {deltaValue >= 0 ? '+' : '−'}
                            {formatCurrency(Math.abs(deltaValue))}
                          </p>
                          {deltaPercent !== null && (
                            <p
                              className={cn(
                                'text-[10px] font-mono tabular-nums',
                                deltaValue >= 0 ? 'text-success/90' : 'text-warning/90'
                              )}
                            >
                              ({deltaPercent >= 0 ? '+' : ''}
                              {deltaPercent.toFixed(1)}%)
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-foreground/30">
                          {isPlanTeaser ? '•••' : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isAvailable &&
                  value != null &&
                  value > 0 &&
                  maxComparisonValue > 0 &&
                  !isPlanTeaser && (
                    <div className="h-1 w-full rounded-full bg-foreground/[0.07] overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-300 ease-out',
                          isSelected || isPending ? 'bg-primary' : 'bg-primary/45'
                        )}
                        style={{ width: barWidth }}
                      />
                    </div>
                  )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
