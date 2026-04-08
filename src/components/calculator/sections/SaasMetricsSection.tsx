'use client'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo, useState, type ReactNode } from 'react'
import { PREVIEW_DECIMALS, useManualPreviewFormatters } from '@/lib/omniPreview'
import { computeSaasPreviewMetrics } from '@/lib/saas'
import { cn } from '@/design-system/utils'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { formatPreviewMetricValue, PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

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

function SaasPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{title}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

interface SaasMetricsSectionProps {
  step: number
  complete: boolean
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
  step,
  complete,
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
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
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

  const coreFilledCount = useMemo(() => {
    const coreFields = [saasArr, saasMrr, saasArrGrowthPct, saasNrrPct]
    return coreFields.filter((v) => v != null && Number.isFinite(v)).length
  }, [saasArr, saasMrr, saasArrGrowthPct, saasNrrPct])

  const advancedFilledCount = useMemo(() => {
    const advancedFields = [saasCac, saasSmSpend, saasCustomerConcentrationPct]
    return advancedFields.filter((v) => v != null && Number.isFinite(v)).length
  }, [saasCac, saasSmSpend, saasCustomerConcentrationPct])

  const totalFields = 11
  const isReady = saasArr != null && Number.isFinite(saasArr) && coreFilledCount >= 3
  const progressPct = (filledCount / totalFields) * 100
  const showAdvancedInputs = advancedExpanded || advancedFilledCount > 0 || isReady

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
        complete={complete}
        title={t('sections.saasMetrics')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('shownForBusinessType', {
              businessType: t('businessTypes.saasSoftware'),
            })}
          </span>
        }
      />

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

      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
            {t('saasPanels.startLeadTitle')}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('fields.saasLead')}</p>
          <p className="text-[11px] text-foreground/45">{t('fields.saasQuickStart')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
              <motion.div
                className={cn(
                  'h-full rounded-full transition-colors',
                  isReady ? 'bg-emerald-500' : 'bg-primary/50'
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
          <p className="whitespace-nowrap text-[10px] text-foreground/45">
            {isReady
              ? t('saasProgress.ready')
              : t('saasProgress.filled', { count: filledCount, total: totalFields })}
          </p>
        </div>
        {!isReady && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('saasProgress.minimumHint')}
          </p>
        )}
      </div>

      <SaasPanel
        title={t('saasPanels.startHereTitle')}
        description={t('saasPanels.startHereDescription')}
      >
        <div className="grid grid-cols-1 gap-3">
          <CurrencyInput
            label={t('fields.saasArr')}
            value={saasArr}
            onChange={(v) => onFieldChange('saas_arr', v)}
            size="sm"
            placeholder="500.000"
            disabled={disabled}
            description={t('fieldHints.saasArr')}
            truncateLabel={false}
          />
          <CurrencyInput
            label={t('fields.saasMrr')}
            value={saasMrr}
            onChange={(v) => onFieldChange('saas_mrr', v)}
            size="sm"
            placeholder="42.000"
            disabled={disabled}
            description={t('fieldHints.saasMrr')}
            truncateLabel={false}
          />
          <AdaptivePercentInput
            label={t('fields.saasArrGrowthPct')}
            value={saasArrGrowthPct}
            onChange={(v) => onFieldChange('saas_arr_growth_pct', v)}
            placeholder="25"
            disabled={disabled}
            description={t('fieldHints.saasArrGrowthPct')}
            truncateLabel={false}
          />
          <AdaptivePercentInput
            label={t('fields.saasNrrPct')}
            value={saasNrrPct}
            onChange={(v) => onFieldChange('saas_nrr_pct', v)}
            placeholder="110"
            disabled={disabled}
            description={t('fieldHints.saasNrrPct')}
            truncateLabel={false}
          />
        </div>
      </SaasPanel>

      <SaasPanel
        title={t('saasPanels.retentionTitle')}
        description={t('saasPanels.retentionDescription')}
      >
        <div className="grid grid-cols-1 gap-3">
          <AdaptivePercentInput
            label={t('fields.saasChurnPct')}
            value={saasChurnPct}
            onChange={(v) => onFieldChange('saas_churn_pct', v)}
            placeholder="5"
            disabled={disabled}
            description={t('fieldHints.saasChurnPct')}
            truncateLabel={false}
          />
          <AdaptivePercentInput
            label={t('fields.saasCustomerChurnPct')}
            value={saasCustomerChurnPct}
            onChange={(v) => onFieldChange('saas_customer_churn_pct', v)}
            placeholder="8"
            disabled={disabled}
            description={t('fieldHints.saasCustomerChurnPct')}
            truncateLabel={false}
          />
          <AdaptivePercentInput
            label={t('fields.saasExpansionRevenuePct')}
            value={saasExpansionRevenuePct}
            onChange={(v) => onFieldChange('saas_expansion_revenue_pct', v)}
            placeholder="12"
            disabled={disabled}
            description={t('fieldHints.saasExpansionRevenuePct')}
            truncateLabel={false}
          />
          <AdaptivePercentInput
            label={t('fields.saasGrossMarginPct')}
            value={saasGrossMarginPct}
            onChange={(v) => onFieldChange('saas_gross_margin_pct', v)}
            placeholder="78"
            disabled={disabled}
            description={t('fieldHints.saasGrossMarginPct')}
            truncateLabel={false}
          />
        </div>
      </SaasPanel>

      {showAdvancedInputs ? (
        <SaasPanel
          title={t('saasPanels.advancedTitle')}
          description={t('saasPanels.advancedDescription')}
        >
          <div className="grid grid-cols-1 gap-3">
            <CurrencyInput
              label={t('fields.saasCac')}
              value={saasCac}
              onChange={(v) => onFieldChange('saas_cac', v)}
              size="sm"
              placeholder="1.500"
              disabled={disabled}
              description={t('fieldHints.saasCac')}
              truncateLabel={false}
            />
            <CurrencyInput
              label={t('fields.saasSmSpend')}
              value={saasSmSpend}
              onChange={(v) => onFieldChange('saas_sm_spend', v)}
              size="sm"
              placeholder="120.000"
              disabled={disabled}
              description={t('fieldHints.saasSmSpend')}
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={t('fields.saasCustomerConcentrationPct')}
              value={saasCustomerConcentrationPct}
              onChange={(v) => onFieldChange('saas_customer_concentration_pct', v)}
              placeholder="20"
              disabled={disabled}
              description={t('fieldHints.saasCustomerConcentrationPct')}
              truncateLabel={false}
            />
          </div>
        </SaasPanel>
      ) : (
        <SaasPanel
          title={t('saasPanels.advancedTitle')}
          description={t('saasPanels.advancedLockedDescription')}
        >
          <button
            type="button"
            onClick={() => setAdvancedExpanded(true)}
            disabled={disabled}
            className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-left text-xs font-medium text-primary/80 transition-colors hover:bg-primary/[0.08] disabled:opacity-50"
            aria-expanded={showAdvancedInputs}
          >
            {t('saasPanels.showAdvancedButton')}
          </button>
        </SaasPanel>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
            {t('sections.saasDerivedMetrics')}
          </h4>
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
        {!isReady && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('fields.saasDerivedNeedMoreInputs')}
          </p>
        )}
      </div>

      {arrProjectionPreview.length > 0 && (
        <div className="rounded-xl border border-foreground/10 bg-background/70 p-3">
          <p className="text-sm font-medium text-foreground">{t('saasProjectionPreview.title')}</p>
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
