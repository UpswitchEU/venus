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
        'relative rounded-xl overflow-hidden transition-all duration-300',
        hasAdjustments ? 'shadow-sm' : ''
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div
        className="absolute inset-0 rounded-xl opacity-40"
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(175 60% 50%) 25%, hsl(264 80% 60%) 50%, hsl(var(--primary)) 75%, hsl(175 60% 50%) 100%)',
          backgroundSize: '300% 300%',
          animation: 'aurora-shift 12s ease-in-out infinite',
          padding: '1px',
        }}
      />

      <div className="relative m-[1px] rounded-[11px] bg-background p-4">
        <div className="absolute inset-0 rounded-[11px] bg-gradient-to-br from-primary/[0.02] via-transparent to-violet-500/[0.02] pointer-events-none" />

        <div className="relative">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground/60 mb-1">
                {mi('fields.normalizedEbitda')}
              </p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">
                  {formatCurrency(normalizedData.averageNormalizedEbitda)}
                </span>
                <span className="text-xs text-foreground/50">
                  ({normalizedData.totalYearsWithData}{' '}
                  {normalizedData.totalYearsWithData === 1 ? mi('year') : mi('years')})
                </span>
                {hasManualAdjustment && (
                  <span
                    className={cn(
                      'text-sm font-medium',
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
            <div className="flex items-center gap-2 sm:shrink-0">
              {(acceptedNormCount > 0 || taxLatencyCount > 0) && (
                <button
                  type="button"
                  onClick={() => onViewAllNormalizations?.()}
                  className="text-xs font-medium text-foreground/60 hover:text-foreground transition-colors underline underline-offset-2 decoration-foreground/20 hover:decoration-foreground/40 whitespace-nowrap"
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
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
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
