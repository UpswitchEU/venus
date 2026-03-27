'use client'

import { motion } from 'framer-motion'
import { AlertCircle, Pencil, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

export interface DcfForecastYearCardRow {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  depreciation?: number
  nwc_change?: number
  isForecast?: boolean
}

interface DcfForecastYearCardProps {
  row: DcfForecastYearCardRow
  previousRevenue?: number
  disabled?: boolean
  hasWarning?: boolean
  warningMessage?: string
  onEditDetails: (year: string) => void
  onRemoveYear?: (year: string) => void
}

export function DcfForecastYearCard({
  row,
  previousRevenue,
  disabled,
  hasWarning,
  warningMessage,
  onEditDetails,
  onRemoveYear,
}: DcfForecastYearCardProps) {
  const t = useTranslations('manualInput')
  const locale = useLocale()

  const fmt = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const fmtPct = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)

  const revenueGrowthPct =
    previousRevenue && previousRevenue > 0 && row.revenue > 0
      ? ((row.revenue - previousRevenue) / previousRevenue) * 100
      : null

  const ebitdaMarginPct =
    row.revenue > 0 && Number.isFinite(row.ebitda / row.revenue)
      ? (row.ebitda / row.revenue) * 100
      : null

  const hasDetailFields =
    (row.capex != null && row.capex !== 0) ||
    (row.depreciation != null && row.depreciation !== 0) ||
    (row.nwc_change != null && row.nwc_change !== 0)

  const isIncomplete = row.revenue <= 0 && row.ebitda === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group relative flex flex-col rounded-xl border border-primary/15 bg-card/90 p-4 backdrop-blur-sm transition-colors hover:border-primary/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{row.year}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/70">
            {t('forecastLabel')}
          </span>
        </div>
        {onRemoveYear && (
          <button
            type="button"
            onClick={() => onRemoveYear(row.year)}
            disabled={disabled}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/15 text-primary/50 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${t('dcfForecastCard.removeYear')} ${row.year}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
            {t('fields.revenue')}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {row.revenue > 0 ? fmt(row.revenue) : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
            {t('dcfForecastCard.revenueGrowth')}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {revenueGrowthPct != null ? `${fmtPct(revenueGrowthPct)}%` : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
            {t('fields.ebitda')}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {row.ebitda !== 0 ? fmt(row.ebitda) : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">
            {t('dcfForecastCard.ebitdaMargin')}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {ebitdaMarginPct != null ? `${fmtPct(ebitdaMarginPct)}%` : '--'}
          </p>
        </div>
      </div>

      {hasDetailFields && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-primary/60">
          <span>{t('dcfForecastCard.detailsConfigured')}</span>
        </div>
      )}

      {(hasWarning || isIncomplete) && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-warning">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{warningMessage || t('fillBothFields')}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => onEditDetails(row.year)}
        disabled={disabled}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-xs font-medium text-primary transition-colors hover:border-primary/25 hover:bg-primary/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Pencil className="h-3 w-3" />
        {t('dcfForecastCard.editDetails')}
      </button>
    </motion.div>
  )
}
