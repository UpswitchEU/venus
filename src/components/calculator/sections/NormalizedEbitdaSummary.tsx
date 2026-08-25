'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { hasExplicitNumericValue as hasExplicitFinancialValue } from '../../../utils/yearlyFinancials'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'

interface NormalizedEbitdaSummaryProps {
  acceptedNormCount: number
  formatCurrency: (amount: number) => string
  hasEbitdaValue: boolean
  hasFinancials: boolean
  normalizedData: ManualInputNormalizedData
  onViewAllNormalizations?: () => void
  taxLatencyCount: number
  totalYearsWithEbitda: number
}

export function NormalizedEbitdaSummary({
  acceptedNormCount,
  formatCurrency,
  hasEbitdaValue,
  hasFinancials,
  normalizedData,
  onViewAllNormalizations,
  taxLatencyCount,
  totalYearsWithEbitda,
}: NormalizedEbitdaSummaryProps) {
  const mi = useTranslations('manualInput')
  const tTax = useTranslations('taxLatency')

  if (!(hasEbitdaValue && hasFinancials && totalYearsWithEbitda > 0)) return null

  const hasAdjustments = normalizedData.years.some(
    (year) => year.totalAdjustment !== 0 || (year.fictiveRentDeduction ?? 0) > 0
  )
  // Reconcile the header adjustment with the per-year detail card: only count
  // years that carry a REAL EBITDA figure (explicit and non-zero, non-forecast).
  // An empty base row (ebitda = 0) would otherwise dilute the average — e.g. a
  // single €20.906 adjustment shown as +€10.453 because a phantom 0-row doubled
  // the denominator.
  const yearsWithEbitda = normalizedData.years.filter(
    (year) =>
      !year.isForecast && hasExplicitFinancialValue(year.ebitda) && Number(year.ebitda) !== 0
  )
  const adjustmentSum = yearsWithEbitda.reduce(
    (sum, year) => sum + (Number.isFinite(year.totalAdjustment) ? year.totalAdjustment : 0),
    0
  )
  const averageAdjustment = yearsWithEbitda.length > 0 ? adjustmentSum / yearsWithEbitda.length : 0
  const safeAverageAdjustment = Number.isFinite(averageAdjustment) ? averageAdjustment : 0
  const hasManualAdjustment = normalizedData.years.some((year) => year.totalAdjustment !== 0)

  return (
    <motion.div
      className={cn(
        '@container relative max-w-full overflow-hidden rounded-xl transition-shadow duration-300 motion-reduce:transition-none',
        hasAdjustments ? 'shadow-sm' : ''
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div
        className="absolute inset-0 rounded-xl opacity-40 [will-change:background-position] animate-[aurora-shift_12s_ease-in-out_infinite] motion-reduce:!animate-none"
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(175 60% 50%) 25%, hsl(264 80% 60%) 50%, hsl(var(--primary)) 75%, hsl(175 60% 50%) 100%)',
          backgroundSize: '300% 300%',
        }}
      />

      <div className="relative m-[1px] max-w-full rounded-[11px] bg-background p-4">
        <div className="absolute inset-0 rounded-[11px] bg-gradient-to-br from-primary/[0.02] via-transparent to-violet-500/[0.02] pointer-events-none" />

        <div className="relative max-w-full min-w-0">
          <div className="flex max-w-full min-w-0 flex-col gap-3 @[46rem]:grid @[46rem]:grid-cols-[minmax(0,1fr)_auto] @[46rem]:items-center">
            <div className="max-w-full min-w-0">
              <p className="text-xs font-medium text-foreground/60 mb-1">
                {mi('fields.normalizedEbitda')}
              </p>
              <div className="flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="shrink-0 whitespace-nowrap text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">
                  {formatCurrency(normalizedData.averageNormalizedEbitda)}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-foreground/50">
                  ({normalizedData.totalYearsWithData}{' '}
                  {normalizedData.totalYearsWithData === 1 ? mi('year') : mi('years')})
                </span>
                {hasManualAdjustment && (
                  <span
                    className={cn(
                      'basis-full text-sm font-medium @[22rem]:basis-auto',
                      safeAverageAdjustment > 0
                        ? 'text-success'
                        : safeAverageAdjustment < 0
                          ? 'text-secondary'
                          : 'text-foreground/40'
                    )}
                  >
                    {safeAverageAdjustment > 0 ? '+' : ''}
                    {formatCurrency(safeAverageAdjustment)}
                  </span>
                )}
              </div>
              {normalizedData.annualFictiveRentDeduction > 0 && (
                <p className="mt-2 text-[11px] leading-snug text-foreground/45">
                  {mi('fictiveRentNormalizedFootnote', {
                    amount: formatCurrency(normalizedData.annualFictiveRentDeduction),
                  })}
                </p>
              )}
            </div>
            <div className="flex max-w-full min-w-0 flex-col items-stretch gap-2 @[46rem]:shrink-0 @[46rem]:flex-row @[46rem]:items-center">
              {(acceptedNormCount > 0 || taxLatencyCount > 0) && (
                <button
                  type="button"
                  onClick={() => onViewAllNormalizations?.()}
                  className="inline-flex min-h-11 min-w-0 items-center self-start text-left text-xs font-medium leading-snug text-foreground/60 underline decoration-foreground/20 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/40 @[46rem]:whitespace-nowrap"
                >
                  {acceptedNormCount > 0 && taxLatencyCount > 0
                    ? `${acceptedNormCount} ${mi('normalizations', { count: acceptedNormCount })} / ${tTax('summary', { count: taxLatencyCount })}`
                    : acceptedNormCount > 0
                      ? `${acceptedNormCount} ${mi('normalizations', { count: acceptedNormCount })}`
                      : tTax('summary', { count: taxLatencyCount })}
                </button>
              )}
              <button
                type="button"
                onClick={() => onViewAllNormalizations?.()}
                className={cn(
                  'min-h-11 w-full shrink-0 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors @[46rem]:w-auto',
                  hasAdjustments
                    ? 'bg-background border border-foreground/10 text-foreground hover:bg-foreground/[0.02]'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {mi('reviewAdjustments')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
