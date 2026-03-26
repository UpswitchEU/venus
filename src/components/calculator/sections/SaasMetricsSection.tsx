'use client'

import { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'

interface SaasMetricsSectionProps {
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasChurnPct?: number
  saasCustomerChurnPct?: number
  saasNrrPct?: number
  saasGrossMarginPct?: number
  saasCac?: number
  saasCustomerConcentrationPct?: number
  saasExpansionRevenuePct?: number
  saasSmSpend?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

function ratioFromPercent(value?: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value / 100
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function formatMetricValue(
  value: number | null,
  formatter: Intl.NumberFormat,
  suffix = ''
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${formatter.format(round(value))}${suffix}`
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

export function SaasMetricsSection({
  saasArr,
  saasMrr,
  saasArrGrowthPct,
  saasChurnPct,
  saasCustomerChurnPct,
  saasNrrPct,
  saasGrossMarginPct,
  saasCac,
  saasCustomerConcentrationPct,
  saasExpansionRevenuePct,
  saasSmSpend,
  onFieldChange,
  disabled,
}: SaasMetricsSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const locale = useLocale()
  const metricFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-BE' : 'nl-BE', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }),
    [locale]
  )

  const derivedMetrics = useMemo(() => {
    const grossMarginRatio = ratioFromPercent(saasGrossMarginPct)
    const revenueChurnRatio = ratioFromPercent(saasChurnPct)
    const customerChurnRatio = ratioFromPercent(saasCustomerChurnPct)

    const ruleOf40 =
      saasArrGrowthPct != null && saasGrossMarginPct != null
        ? saasArrGrowthPct + saasGrossMarginPct
        : null

    const ltvCac =
      saasArr != null &&
      saasCac != null &&
      saasCac > 0 &&
      grossMarginRatio != null &&
      customerChurnRatio != null &&
      customerChurnRatio > 0
        ? ((saasArr * grossMarginRatio) / customerChurnRatio) / saasCac
        : null

    const cacPaybackMonths =
      saasCac != null &&
      saasCac > 0 &&
      saasMrr != null &&
      saasMrr > 0 &&
      grossMarginRatio != null &&
      grossMarginRatio > 0
        ? saasCac / (saasMrr * grossMarginRatio)
        : null

    const magicNumber =
      saasArr != null &&
      saasArr > 0 &&
      saasArrGrowthPct != null &&
      saasSmSpend != null &&
      saasSmSpend > 0
        ? ((saasArr * (saasArrGrowthPct / 100)) / saasSmSpend) * 4
        : null

    return {
      ruleOf40,
      ltvCac,
      cacPaybackMonths,
      magicNumber,
      nrrExpansionSpread:
        saasNrrPct != null && revenueChurnRatio != null
          ? saasNrrPct - (100 - revenueChurnRatio * 100)
          : null,
      expansionRevenuePct: saasExpansionRevenuePct ?? null,
    }
  }, [
    saasArr,
    saasArrGrowthPct,
    saasCac,
    saasChurnPct,
    saasCustomerChurnPct,
    saasExpansionRevenuePct,
    saasGrossMarginPct,
    saasMrr,
    saasNrrPct,
    saasSmSpend,
  ])

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4 pt-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Zap className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          {t('sections.saasMetrics')}
        </h3>
        <span className="text-[10px] font-medium text-primary/70 bg-primary/8 px-1.5 py-0.5 rounded-full">
          {t('shownForBusinessType', {
            businessType: t('businessTypes.saasSoftware'),
          })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CurrencyInput
          label={t('fields.saasArr')}
          value={saasArr}
          onChange={(v) => onFieldChange('saas_arr', v)}
          size="sm"
          placeholder="500.000"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.saasMrr')}
          value={saasMrr}
          onChange={(v) => onFieldChange('saas_mrr', v)}
          size="sm"
          placeholder="42.000"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasArrGrowthPct')}
          value={saasArrGrowthPct}
          onChange={(v) => onFieldChange('saas_arr_growth_pct', v)}
          placeholder="25"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasChurnPct')}
          value={saasChurnPct}
          onChange={(v) => onFieldChange('saas_churn_pct', v)}
          placeholder="5"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasCustomerChurnPct')}
          value={saasCustomerChurnPct}
          onChange={(v) => onFieldChange('saas_customer_churn_pct', v)}
          placeholder="8"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasNrrPct')}
          value={saasNrrPct}
          onChange={(v) => onFieldChange('saas_nrr_pct', v)}
          placeholder="110"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasGrossMarginPct')}
          value={saasGrossMarginPct}
          onChange={(v) => onFieldChange('saas_gross_margin_pct', v)}
          placeholder="78"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.saasCac')}
          value={saasCac}
          onChange={(v) => onFieldChange('saas_cac', v)}
          size="sm"
          placeholder="1.500"
          disabled={disabled}
        />
        <CurrencyInput
          label={t('fields.saasSmSpend')}
          value={saasSmSpend}
          onChange={(v) => onFieldChange('saas_sm_spend', v)}
          size="sm"
          placeholder="120.000"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasCustomerConcentrationPct')}
          value={saasCustomerConcentrationPct}
          onChange={(v) => onFieldChange('saas_customer_concentration_pct', v)}
          placeholder="20"
          disabled={disabled}
        />
        <AdaptivePercentInput
          label={t('fields.saasExpansionRevenuePct')}
          value={saasExpansionRevenuePct}
          onChange={(v) => onFieldChange('saas_expansion_revenue_pct', v)}
          placeholder="12"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            {t('sections.saasDerivedMetrics')}
          </h4>
          <span className="text-[10px] text-foreground/45">{t('fields.saasAutoCalculated')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <MetricCard
            label={t('fields.ruleOf40Score')}
            value={formatMetricValue(derivedMetrics.ruleOf40, metricFormatter, '%')}
          />
          <MetricCard
            label={t('fields.ltvCacRatio')}
            value={formatMetricValue(derivedMetrics.ltvCac, metricFormatter, 'x')}
          />
          <MetricCard
            label={t('fields.cacPaybackMonths')}
            value={formatMetricValue(derivedMetrics.cacPaybackMonths, metricFormatter)}
          />
          <MetricCard
            label={t('fields.magicNumber')}
            value={formatMetricValue(derivedMetrics.magicNumber, metricFormatter, 'x')}
          />
          <MetricCard
            label={t('fields.saasExpansionRevenuePct')}
            value={formatMetricValue(derivedMetrics.expansionRevenuePct, metricFormatter, '%')}
          />
          <MetricCard
            label={t('fields.nrrExpansionSpread')}
            value={formatMetricValue(derivedMetrics.nrrExpansionSpread, metricFormatter, ' pts')}
          />
        </div>
      </div>
    </motion.section>
  )
}
