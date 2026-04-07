'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  computeEbitdaMarginPct,
  computeRevenueQualityPreview,
  getRecurringRevenueBadge,
  getTopClientBadge,
  resolveRevenueQualityBadgeVariant,
  useManualPreviewFormatters,
} from '@/lib/omniPreview'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { type MetricHealthStatus, PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

const SAAS_BUSINESS_TYPE_IDS = new Set([
  'software',
  'saas',
  'software_development',
  'it_services',
  'cloud_computing',
])

const TECH_CATEGORIES = new Set([
  'technology',
  'saas_software',
  'tech',
])

const EMPTY_METHODS: string[] = []

interface RevenueQualitySectionProps {
  step: number
  revRecurringPct?: number
  revTopClientConcentrationPct?: number
  revContractBacklog?: number
  revRecurringAmount?: number
  revTopClientAmount?: number
  revGrossChurnPct?: number
  revenue?: number
  ebitda?: number
  effectiveMethods?: string[]
  businessTypeId?: string
  businessCategory?: string
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

function isSaasOrTech(businessTypeId?: string, businessCategory?: string): boolean {
  if (businessTypeId && SAAS_BUSINESS_TYPE_IDS.has(businessTypeId.toLowerCase())) return true
  if (businessCategory && TECH_CATEGORIES.has(businessCategory.toLowerCase())) return true
  return false
}

type BadgeVariant = 'success' | 'warning' | 'destructive'

const BADGE_COLORS: Record<BadgeVariant, string> = {
  success: 'border-success/20 bg-success/[0.06] text-success',
  warning: 'border-warning/20 bg-warning/[0.06] text-warning',
  destructive: 'border-destructive/20 bg-destructive/[0.06] text-destructive',
}

function LiveBadge({
  pct,
  label,
  variant,
}: {
  pct: string
  label: string
  variant: BadgeVariant
}) {
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-medium leading-tight ${BADGE_COLORS[variant]}`}
      role="status"
    >
      <span className="tabular-nums">{pct}</span>
      <span className="opacity-80">—</span>
      <span>{label}</span>
    </span>
  )
}

function toBadgeVariant(
  badge: 'low' | 'medium' | 'high' | null,
  inverted: boolean
): BadgeVariant | null {
  if (!badge) return null
  if (inverted) return badge === 'high' ? 'destructive' : 'success'
  if (badge === 'high') return 'success'
  if (badge === 'medium') return 'warning'
  return 'destructive'
}

export function RevenueQualitySection({
  step,
  revRecurringPct,
  revTopClientConcentrationPct,
  revContractBacklog,
  revRecurringAmount,
  revTopClientAmount,
  revGrossChurnPct,
  revenue,
  ebitda,
  effectiveMethods = EMPTY_METHODS,
  businessTypeId,
  businessCategory,
  onFieldChange,
  disabled,
}: RevenueQualitySectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { ratio: metricFormatter, currency: currencyFormatter } = useManualPreviewFormatters()

  const isTechSaas = useMemo(
    () => isSaasOrTech(businessTypeId, businessCategory),
    [businessTypeId, businessCategory]
  )

  const sectionComplete = useMemo(
    () =>
      revRecurringAmount != null ||
      revTopClientAmount != null ||
      revRecurringPct != null ||
      revTopClientConcentrationPct != null ||
      (revContractBacklog != null && Number.isFinite(revContractBacklog)) ||
      revGrossChurnPct != null,
    [revRecurringAmount, revTopClientAmount, revRecurringPct, revTopClientConcentrationPct, revContractBacklog, revGrossChurnPct]
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
        revRecurringAmount,
        revTopClientAmount,
      }),
    [revenue, revRecurringPct, revTopClientConcentrationPct, revContractBacklog, revRecurringAmount, revTopClientAmount]
  )

  const ebitdaMarginPct = useMemo(() => computeEbitdaMarginPct(revenue, ebitda), [revenue, ebitda])

  const recurringBadge = useMemo(
    () => getRecurringRevenueBadge(derived.recurringPctOfRevenue),
    [derived.recurringPctOfRevenue]
  )

  const topClientBadge = useMemo(
    () => getTopClientBadge(derived.topClientPctOfRevenue),
    [derived.topClientPctOfRevenue]
  )

  const recurringBadgeLabel = useMemo(() => {
    if (!recurringBadge) return undefined
    if (recurringBadge === 'low') return t('fields.revRecurringBadgeLow')
    if (recurringBadge === 'medium') return t('fields.revRecurringBadgeMedium')
    return t('fields.revRecurringBadgeHigh')
  }, [recurringBadge, t])

  const topClientBadgeLabel = useMemo(() => {
    if (!topClientBadge) return undefined
    return topClientBadge === 'high'
      ? t('fields.revTopClientBadgeHigh')
      : t('fields.revTopClientBadgeLow')
  }, [topClientBadge, t])

  const recurringPctDisplay = derived.recurringPctOfRevenue != null
    ? `${Math.round(derived.recurringPctOfRevenue)}%`
    : undefined

  const topClientPctDisplay = derived.topClientPctOfRevenue != null
    ? `${Math.round(derived.topClientPctOfRevenue)}%`
    : undefined

  // Recurring: low → destructive, medium → warning, high → success
  const recurringBadgeVariant = toBadgeVariant(recurringBadge, false)
  // Top-client: high concentration → destructive (inverted risk semantics)
  const topClientBadgeVariant = toBadgeVariant(topClientBadge, true)

  const recurringHealthStatus: MetricHealthStatus | null = useMemo(() => {
    if (!recurringBadge) return null
    if (recurringBadge === 'high') return 'excellent'
    if (recurringBadge === 'medium') return 'warning'
    return 'poor'
  }, [recurringBadge])

  const topClientHealthStatus: MetricHealthStatus | null = useMemo(() => {
    if (!topClientBadge) return null
    return topClientBadge === 'high' ? 'poor' : 'excellent'
  }, [topClientBadge])

  const ebitdaMarginHealthStatus: MetricHealthStatus | null = useMemo(() => {
    if (ebitdaMarginPct == null) return null
    if (ebitdaMarginPct >= 20) return 'excellent'
    if (ebitdaMarginPct >= 10) return 'good'
    if (ebitdaMarginPct >= 5) return 'warning'
    return 'poor'
  }, [ebitdaMarginPct])

  const hasRevenue = revenue != null && Number.isFinite(revenue) && revenue > 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
      aria-label={t('sections.revenueQuality')}
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

      <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
        {t('fields.revenueQualityLead')}
      </p>

      {/* Input fields in a grouped panel (matches DCF convention) */}
      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Recurring revenue: currency input */}
          <div>
            <CurrencyInput
              label={t('fields.revRecurringCurrency')}
              value={revRecurringAmount}
              onChange={(v) => onFieldChange('rev_recurring_amount', v)}
              placeholder="400.000"
              disabled={disabled}
              description={t('fields.revRecurringCurrencyDescription')}
            />
            {recurringBadgeVariant && recurringPctDisplay && recurringBadgeLabel && (
              <LiveBadge
                pct={recurringPctDisplay}
                label={recurringBadgeLabel}
                variant={recurringBadgeVariant}
              />
            )}
          </div>

          {/* Top-client concentration: currency input */}
          <div>
            <CurrencyInput
              label={t('fields.revTopClientCurrency')}
              value={revTopClientAmount}
              onChange={(v) => onFieldChange('rev_top_client_amount', v)}
              placeholder="150.000"
              disabled={disabled}
              description={t('fields.revTopClientCurrencyTooltip')}
            />
            {topClientBadgeVariant && topClientPctDisplay && topClientBadgeLabel && (
              <LiveBadge
                pct={topClientPctDisplay}
                label={topClientBadgeLabel}
                variant={topClientBadgeVariant}
              />
            )}
          </div>
        </div>

        {/* Conditional: SaaS churn rate OR traditional backlog */}
        {isTechSaas ? (
          <AdaptivePercentInput
            label={t('fields.revGrossChurnPct')}
            value={revGrossChurnPct}
            onChange={(v) => onFieldChange('rev_gross_churn_pct', v)}
            placeholder="8"
            disabled={disabled}
            description={t('fields.revGrossChurnTooltip')}
          />
        ) : (
          <CurrencyInput
            label={t('fields.revContractBacklog')}
            value={revContractBacklog}
            onChange={(v) => onFieldChange('rev_contract_backlog', v)}
            size="sm"
            placeholder="250.000"
            disabled={disabled}
            description={t('fields.revContractBacklogDescription')}
          />
        )}
      </div>

      {/* Derived market context mini-dashboard */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {t('sections.revenueQualityDerived')}
        </h4>
        {hasRevenue ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PreviewMetricCard
              label={t('fields.revenueQualityEbitdaMargin')}
              value={
                ebitdaMarginPct != null
                  ? `${metricFormatter.format(Math.round(ebitdaMarginPct * 10) / 10)}%`
                  : '—'
              }
              status={ebitdaMarginHealthStatus}
              statusLabel={
                ebitdaMarginPct != null
                  ? t('fields.revenueQualityEbitdaMarginBenchmark', { median: '18' })
                  : undefined
              }
            />
            <PreviewMetricCard
              label={t('fields.revenueQualityErecurring')}
              value={
                derived.recurringPctOfRevenue != null
                  ? `${Math.round(derived.recurringPctOfRevenue)}%`
                  : '—'
              }
              hint={
                derived.estimatedRecurringRevenue != null
                  ? currencyFormatter.format(derived.estimatedRecurringRevenue)
                  : undefined
              }
              status={recurringHealthStatus}
              statusLabel={recurringBadgeLabel}
            />
            <PreviewMetricCard
              label={t('fields.revenueQualityTopClientExposure')}
              value={
                derived.topClientPctOfRevenue != null
                  ? `${Math.round(derived.topClientPctOfRevenue)}%`
                  : '—'
              }
              hint={
                derived.topClientRevenueAtRisk != null
                  ? currencyFormatter.format(derived.topClientRevenueAtRisk)
                  : undefined
              }
              status={topClientHealthStatus}
              statusLabel={topClientBadgeLabel}
            />
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('fields.revenueQualityNeedFinancials')}
          </p>
        )}
        <p className="text-[10px] text-foreground/40">
          {t('fields.revenueQualityPreviewFootnote')}
        </p>
      </div>
    </motion.section>
  )
}
