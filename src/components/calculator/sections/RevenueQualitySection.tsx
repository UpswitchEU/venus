'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  computeEbitdaMarginPct,
  computeRevenueQualityPreview,
  PREVIEW_DECIMALS,
  resolveRevenueQualityBadgeVariant,
  useManualPreviewFormatters,
} from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { formatPreviewMetricValue, PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface RevenueQualitySectionProps {
  step: number
  revRecurringPct?: number
  revTopClientConcentrationPct?: number
  revContractBacklog?: number
  /** Latest complete year — drives omni-aligned ratio context. */
  revenue?: number
  ebitda?: number
  /** Selected method keys (e.g. omzet_multiple + ebitda_multiple) — badge copy. */
  effectiveMethods?: string[]
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function RevenueQualitySection({
  step,
  revRecurringPct,
  revTopClientConcentrationPct,
  revContractBacklog,
  revenue,
  ebitda,
  effectiveMethods = [],
  onFieldChange,
  disabled,
}: RevenueQualitySectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { ratio: metricFormatter, currency: currencyFormatter } = useManualPreviewFormatters()

  const sectionComplete = useMemo(
    () =>
      revRecurringPct != null ||
      revTopClientConcentrationPct != null ||
      (revContractBacklog != null && Number.isFinite(revContractBacklog)),
    [revRecurringPct, revTopClientConcentrationPct, revContractBacklog]
  )

  const badgeVariant = useMemo(
    () => resolveRevenueQualityBadgeVariant(effectiveMethods),
    [effectiveMethods]
  )

  const badgeLabel = useMemo(() => {
    if (badgeVariant === 'both') return t('revenueQualityBadgeBoth')
    if (badgeVariant === 'omzet') return t('revenueQualityBadgeOmzet')
    return t('revenueQualityBadgeEbitda')
  }, [badgeVariant, t])

  const derived = useMemo(
    () =>
      computeRevenueQualityPreview({
        revenue,
        revRecurringPct,
        revTopClientConcentrationPct,
        revContractBacklog,
      }),
    [revenue, revRecurringPct, revTopClientConcentrationPct, revContractBacklog]
  )

  const ebitdaMarginPct = useMemo(() => computeEbitdaMarginPct(revenue, ebitda), [revenue, ebitda])

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={t('sections.revenueQuality')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('recommendedForMethod', { method: badgeLabel })}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AdaptivePercentInput
          label={t('fields.revRecurringPct')}
          value={revRecurringPct}
          onChange={(v) => onFieldChange('rev_recurring_pct', v)}
          placeholder="60"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.revTopClientConcentrationPct')}
          value={revTopClientConcentrationPct}
          onChange={(v) => onFieldChange('rev_top_client_concentration_pct', v)}
          placeholder="15"
          disabled={disabled}
        />
        <div className="col-span-2">
          <CurrencyInput
            label={t('fields.revContractBacklog')}
            value={revContractBacklog}
            onChange={(v) => onFieldChange('rev_contract_backlog', v)}
            size="sm"
            placeholder="250.000"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            {t('sections.revenueQualityDerived')}
          </h4>
          <span className="text-[10px] text-foreground/45">{t('fields.revenueQualityPreviewFootnote')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <PreviewMetricCard
            label={t('fields.revenueQualityEbitdaMargin')}
            value={formatPreviewMetricValue(
              ebitdaMarginPct,
              metricFormatter,
              PREVIEW_DECIMALS.ratio,
              '%'
            )}
          />
          <PreviewMetricCard
            label={t('fields.revenueQualityErecurring')}
            value={
              derived.estimatedRecurringRevenue != null
                ? currencyFormatter.format(derived.estimatedRecurringRevenue)
                : '—'
            }
          />
          <PreviewMetricCard
            label={t('fields.revenueQualityTopClientExposure')}
            value={
              derived.topClientRevenueAtRisk != null
                ? currencyFormatter.format(derived.topClientRevenueAtRisk)
                : '—'
            }
          />
          <PreviewMetricCard
            label={t('fields.revenueQualityBacklogMonths')}
            value={formatPreviewMetricValue(
              derived.backlogMonthsOfRevenue,
              metricFormatter,
              PREVIEW_DECIMALS.ratio,
              ` ${t('fields.revenueQualityMonthsSuffix')}`
            )}
          />
        </div>
      </div>
    </motion.section>
  )
}
