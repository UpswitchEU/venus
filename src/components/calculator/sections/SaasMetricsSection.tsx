'use client'
import { motion } from 'framer-motion'
import { BarChart3, RefreshCw, Shield, TrendingUp, Users, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { PREVIEW_DECIMALS, useManualPreviewFormatters } from '@/lib/omniPreview'
import { computeSaasPreviewMetrics } from '@/lib/saas'
import { cn } from '@/design-system/utils'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { formatPreviewMetricValue, PreviewMetricCard } from './previewMetricCards'

type HealthStatus = 'excellent' | 'good' | 'warning' | 'poor'

function getHealthStatus(metric: string, value: number | null): HealthStatus | null {
  if (value == null || !Number.isFinite(value)) return null
  switch (metric) {
    case 'ruleOf40':
      if (value >= 40) return 'excellent'
      if (value >= 25) return 'good'
      if (value >= 10) return 'warning'
      return 'poor'
    case 'ltvCac':
      if (value >= 3) return 'excellent'
      if (value >= 2) return 'good'
      if (value >= 1) return 'warning'
      return 'poor'
    case 'cacPaybackMonths':
      if (value <= 12) return 'excellent'
      if (value <= 18) return 'good'
      if (value <= 24) return 'warning'
      return 'poor'
    case 'magicNumber':
      if (value >= 1) return 'excellent'
      if (value >= 0.75) return 'good'
      if (value >= 0.5) return 'warning'
      return 'poor'
    case 'nrrExpansionSpread':
      if (value >= 20) return 'excellent'
      if (value >= 10) return 'good'
      if (value >= 0) return 'warning'
      return 'poor'
    default:
      return null
  }
}

function SaasGroupHeader({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-2 pb-1.5">
      <Icon className="h-3.5 w-3.5 text-primary/60" />
      <div>
        <h4 className="text-xs font-semibold text-foreground/70">{title}</h4>
        <p className="text-[10px] text-foreground/40">{hint}</p>
      </div>
    </div>
  )
}

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
  arrProjectionPreview?: Array<{ year: number; arr: number }>
  importedSaasProvenance?: {
    source?: string
    confidence?: number
    derivation_method?: string
    fiscal_year?: number
  } | null
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
  arrProjectionPreview = [],
  importedSaasProvenance,
}: SaasMetricsSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { saasMetric: metricFormatter, currency: currencyFormatter } = useManualPreviewFormatters()
  const importedProviderLabel = importedSaasProvenance?.source
    ? importedSaasProvenance.source.charAt(0).toUpperCase() + importedSaasProvenance.source.slice(1)
    : null

  const derivedMetrics = useMemo(
    () =>
      computeSaasPreviewMetrics({
        saasArr,
        saasMrr,
        saasArrGrowthPct,
        saasChurnPct,
        saasCustomerChurnPct,
        saasNrrPct,
        saasGrossMarginPct,
        saasCac,
        saasSmSpend,
      }),
    [
      saasArr,
      saasArrGrowthPct,
      saasCac,
      saasChurnPct,
      saasCustomerChurnPct,
      saasGrossMarginPct,
      saasMrr,
      saasNrrPct,
      saasSmSpend,
    ],
  )

  const filledCount = useMemo(() => {
    const fields = [
      saasArr, saasMrr, saasArrGrowthPct, saasChurnPct,
      saasCustomerChurnPct, saasNrrPct, saasGrossMarginPct,
      saasCac, saasSmSpend, saasCustomerConcentrationPct,
      saasExpansionRevenuePct,
    ]
    return fields.filter((v) => v != null && Number.isFinite(v)).length
  }, [
    saasArr, saasMrr, saasArrGrowthPct, saasChurnPct,
    saasCustomerChurnPct, saasNrrPct, saasGrossMarginPct,
    saasCac, saasSmSpend, saasCustomerConcentrationPct,
    saasExpansionRevenuePct,
  ])

  const totalFields = 11
  const isReady = saasArr != null && filledCount >= 3

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-5 pt-2"
    >
      {importedSaasProvenance && importedProviderLabel && (
        <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">{t('saasImported.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('saasImported.description', {
              provider: importedProviderLabel,
              confidence: Math.round((importedSaasProvenance.confidence ?? 0) * 100),
              year: importedSaasProvenance.fiscal_year ?? '—',
            })}
          </p>
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full transition-colors',
                isReady ? 'bg-emerald-500' : 'bg-primary/50'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${(filledCount / totalFields) * 100}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>
        <p className="text-[10px] text-foreground/45 whitespace-nowrap">
          {isReady
            ? t('saasProgress.ready')
            : t('saasProgress.filled', { count: filledCount, total: totalFields })}
        </p>
      </div>
      {!isReady && (
        <p className="text-[10px] text-foreground/35 -mt-3">
          {t('saasProgress.minimumHint')}
        </p>
      )}

      {/* Group 1: Revenue & Growth */}
      <div className="space-y-2.5">
        <SaasGroupHeader
          icon={TrendingUp}
          title={t('saasGroupHeaders.revenueGrowth')}
          hint={t('saasGroupHeaders.revenueGrowthHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencyInput
            label={t('fields.saasArr')}
            value={saasArr}
            onChange={(v) => onFieldChange('saas_arr', v)}
            size="sm"
            placeholder="500.000"
            disabled={disabled}
            description={t('fieldHints.saasArr')}
          />
          <CurrencyInput
            label={t('fields.saasMrr')}
            value={saasMrr}
            onChange={(v) => onFieldChange('saas_mrr', v)}
            size="sm"
            placeholder="42.000"
            disabled={disabled}
            description={t('fieldHints.saasMrr')}
          />
          <AdaptivePercentInput
            label={t('fields.saasArrGrowthPct')}
            value={saasArrGrowthPct}
            onChange={(v) => onFieldChange('saas_arr_growth_pct', v)}
            placeholder="25"
            disabled={disabled}
            description={t('fieldHints.saasArrGrowthPct')}
          />
        </div>
      </div>

      {/* Group 2: Retention & Churn */}
      <div className="space-y-2.5">
        <SaasGroupHeader
          icon={RefreshCw}
          title={t('saasGroupHeaders.retentionChurn')}
          hint={t('saasGroupHeaders.retentionChurnHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdaptivePercentInput
            label={t('fields.saasChurnPct')}
            value={saasChurnPct}
            onChange={(v) => onFieldChange('saas_churn_pct', v)}
            placeholder="5"
            disabled={disabled}
            description={t('fieldHints.saasChurnPct')}
          />
          <AdaptivePercentInput
            label={t('fields.saasCustomerChurnPct')}
            value={saasCustomerChurnPct}
            onChange={(v) => onFieldChange('saas_customer_churn_pct', v)}
            placeholder="8"
            disabled={disabled}
            description={t('fieldHints.saasCustomerChurnPct')}
          />
          <AdaptivePercentInput
            label={t('fields.saasNrrPct')}
            value={saasNrrPct}
            onChange={(v) => onFieldChange('saas_nrr_pct', v)}
            placeholder="110"
            disabled={disabled}
            description={t('fieldHints.saasNrrPct')}
          />
          <AdaptivePercentInput
            label={t('fields.saasExpansionRevenuePct')}
            value={saasExpansionRevenuePct}
            onChange={(v) => onFieldChange('saas_expansion_revenue_pct', v)}
            placeholder="12"
            disabled={disabled}
            description={t('fieldHints.saasExpansionRevenuePct')}
          />
        </div>
      </div>

      {/* Group 3: Profitability & Risk */}
      <div className="space-y-2.5">
        <SaasGroupHeader
          icon={Shield}
          title={t('saasGroupHeaders.profitability')}
          hint={t('saasGroupHeaders.profitabilityHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdaptivePercentInput
            label={t('fields.saasGrossMarginPct')}
            value={saasGrossMarginPct}
            onChange={(v) => onFieldChange('saas_gross_margin_pct', v)}
            placeholder="78"
            disabled={disabled}
            description={t('fieldHints.saasGrossMarginPct')}
          />
          <AdaptivePercentInput
            label={t('fields.saasCustomerConcentrationPct')}
            value={saasCustomerConcentrationPct}
            onChange={(v) => onFieldChange('saas_customer_concentration_pct', v)}
            placeholder="20"
            disabled={disabled}
            description={t('fieldHints.saasCustomerConcentrationPct')}
          />
        </div>
      </div>

      {/* Group 4: Unit Economics */}
      <div className="space-y-2.5">
        <SaasGroupHeader
          icon={Users}
          title={t('saasGroupHeaders.unitEconomics')}
          hint={t('saasGroupHeaders.unitEconomicsHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencyInput
            label={t('fields.saasCac')}
            value={saasCac}
            onChange={(v) => onFieldChange('saas_cac', v)}
            size="sm"
            placeholder="1.500"
            disabled={disabled}
            description={t('fieldHints.saasCac')}
          />
          <CurrencyInput
            label={t('fields.saasSmSpend')}
            value={saasSmSpend}
            onChange={(v) => onFieldChange('saas_sm_spend', v)}
            size="sm"
            placeholder="120.000"
            disabled={disabled}
            description={t('fieldHints.saasSmSpend')}
          />
        </div>
      </div>

      {/* Calculated SaaS Signals with health indicators */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-primary/60" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
              {t('sections.saasDerivedMetrics')}
            </h4>
          </div>
          <span className="text-[10px] text-foreground/45">{t('fields.saasAutoCalculated')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {([
            { key: 'ruleOf40', label: t('fields.ruleOf40Score'), value: derivedMetrics.ruleOf40, suffix: '%' },
            { key: 'ltvCac', label: t('fields.ltvCacRatio'), value: derivedMetrics.ltvCac, suffix: 'x' },
            { key: 'cacPaybackMonths', label: t('fields.cacPaybackMonths'), value: derivedMetrics.cacPaybackMonths, suffix: '' },
            { key: 'magicNumber', label: t('fields.magicNumber'), value: derivedMetrics.magicNumber, suffix: 'x' },
            { key: 'nrrExpansionSpread', label: t('fields.nrrExpansionSpread'), value: derivedMetrics.nrrExpansionSpread, suffix: ' pts' },
          ] as const).map(({ key, label, value, suffix }) => {
            const status = getHealthStatus(key, value)
            return (
              <PreviewMetricCard
                key={key}
                label={label}
                value={formatPreviewMetricValue(
                  value,
                  metricFormatter,
                  PREVIEW_DECIMALS.saasMetric,
                  suffix
                )}
                status={status}
                statusLabel={status ? t(`saasHealthStatus.${status}`) : undefined}
              />
            )
          })}
        </div>
      </div>

      {arrProjectionPreview.length > 0 && (
        <div className="rounded-xl border border-foreground/10 bg-background/70 p-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">
              {t('saasProjectionPreview.title')}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {t('saasProjectionPreview.description')}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {arrProjectionPreview.map((row) => (
              <div
                key={row.year}
                className="rounded-lg border border-foreground/8 bg-foreground/[0.02] px-3 py-2"
              >
                <p className="text-xs font-semibold text-foreground">{row.year}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t('saasProjectionPreview.arr')}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {currencyFormatter.format(row.arr)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.section>
  )
}
