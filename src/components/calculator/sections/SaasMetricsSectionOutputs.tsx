'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { PREVIEW_DECIMALS, useManualPreviewFormatters } from '@/lib/omniPreview'
import type { SaasPreviewMetrics } from '@/lib/saas'
import { formatPreviewMetricValue, PreviewMetricCard } from './previewMetricCards'
import { getSaasMetricHealthStatus } from './saasMetricsHealth'

export interface SaasImportedProvenance {
  source?: string
  confidence?: number
  derivation_method?: string
  fiscal_year?: number
}

export function SaasImportedProvenanceBanner({
  provenance,
}: {
  provenance: SaasImportedProvenance
}) {
  const t = useTranslations('manualInput.methodSelector')
  const providerLabel = provenance.source
    ? provenance.source.charAt(0).toUpperCase() + provenance.source.slice(1)
    : null

  if (!providerLabel) return null

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">{t('saasImported.title')}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t('saasImported.description', {
          provider: providerLabel,
          confidence: Math.round((provenance.confidence ?? 0) * 100),
          year: provenance.fiscal_year ?? '—',
        })}
      </p>
    </div>
  )
}

export function SaasProgressCard({
  filledCount,
  isReady,
  progressPct,
  totalFields,
}: {
  filledCount: number
  isReady: boolean
  progressPct: number
  totalFields: number
}) {
  const t = useTranslations('manualInput.methodSelector')

  return (
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
  )
}

const SAAS_DERIVED_METRIC_CONFIG = [
  { key: 'ruleOf40', labelKey: 'fields.ruleOf40Score', suffix: '%' },
  { key: 'ltvCac', labelKey: 'fields.ltvCacRatio', suffix: 'x' },
  { key: 'cacPaybackMonths', labelKey: 'fields.cacPaybackMonths', suffix: '' },
  { key: 'magicNumber', labelKey: 'fields.magicNumber', suffix: 'x' },
  { key: 'nrrExpansionSpread', labelKey: 'fields.nrrExpansionSpread', suffix: ' pts' },
] as const

export function SaasDerivedMetricsGrid({
  derivedMetrics,
  isReady,
}: {
  derivedMetrics: SaasPreviewMetrics
  isReady: boolean
}) {
  const t = useTranslations('manualInput.methodSelector')
  const { saasMetric: metricFormatter } = useManualPreviewFormatters()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {t('sections.saasDerivedMetrics')}
        </h4>
        <span className="text-[10px] text-foreground/45">{t('fields.saasAutoCalculated')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {SAAS_DERIVED_METRIC_CONFIG.map(({ key, labelKey, suffix }) => {
          const value = derivedMetrics[key]
          const status = getSaasMetricHealthStatus(key, value)
          const formula = t(`saasFormulas.${key}`)
          return (
            <div key={key} title={formula}>
              <PreviewMetricCard
                label={t(labelKey)}
                value={formatPreviewMetricValue(
                  value,
                  metricFormatter,
                  PREVIEW_DECIMALS.saasMetric,
                  suffix
                )}
                status={status}
                statusLabel={status ? t(`saasHealthStatus.${status}`) : undefined}
              />
            </div>
          )
        })}
      </div>
      {!isReady && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('fields.saasDerivedNeedMoreInputs')}
        </p>
      )}
    </div>
  )
}

export function SaasArrProjectionPreviewCard({
  rows,
}: {
  rows: Array<{ year: number; arr: number }>
}) {
  const t = useTranslations('manualInput.methodSelector')
  const { currency: currencyFormatter } = useManualPreviewFormatters()

  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-foreground/10 bg-background/70 p-3">
      <p className="text-sm font-medium text-foreground">{t('saasProjectionPreview.title')}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        {t('saasProjectionPreview.description')}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
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
  )
}
