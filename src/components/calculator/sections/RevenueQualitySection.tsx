'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { cn } from '@/design-system/utils'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { businessTypeCategoryStrings } from '@/utils/businessTypeCategory'
import { isRevenueMethodologyKey } from '@/utils/extractValuationResultsMap'
import { isFiniteNumeric } from '@/utils/isFiniteNumeric'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

const SAAS_BUSINESS_TYPE_IDS = new Set([
  'software',
  'saas',
  'software_development',
  'it_services',
  'cloud_computing',
])

const TECH_CATEGORIES = new Set(['technology', 'saas_software', 'tech'])

const EMPTY_METHODS: string[] = []

interface RevenueQualitySectionProps {
  step: number
  revContractBacklog?: number
  revRecurringAmount?: number
  revTopClientAmount?: number
  revGrossChurnPct?: number
  revCapitalizedRdAmount?: number
  latestRevenue?: number
  effectiveMethods?: string[]
  businessTypeId?: string
  businessCategory?: unknown
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

function isEbitdaOnlyContext(methods: string[]): boolean {
  if (methods.length === 0) return false
  const multiples = methods.filter((m) => m !== 'upswitch_adaptive')
  return multiples.length > 0 && multiples.every((m) => m === 'ebitda_multiple')
}

function normalizeLowerLookupKeys(value: unknown): string[] {
  return businessTypeCategoryStrings(value).map((text) => text.toLowerCase())
}

function isSaasOrTech(businessTypeId?: string, businessCategory?: unknown): boolean {
  if (businessTypeId && SAAS_BUSINESS_TYPE_IDS.has(businessTypeId.toLowerCase())) return true
  if (
    normalizeLowerLookupKeys(businessCategory).some((categoryKey) =>
      TECH_CATEGORIES.has(categoryKey)
    )
  ) {
    return true
  }
  return false
}

export function RevenueQualitySection({
  step,
  revContractBacklog,
  revRecurringAmount,
  revTopClientAmount,
  revGrossChurnPct,
  revCapitalizedRdAmount,
  latestRevenue,
  effectiveMethods = EMPTY_METHODS,
  businessTypeId,
  businessCategory,
  onFieldChange,
  disabled,
}: RevenueQualitySectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { currency: currencyFormatter, ratio: ratioFormatter } = useManualPreviewFormatters()

  const isTechSaas = useMemo(
    () => isSaasOrTech(businessTypeId, businessCategory),
    [businessTypeId, businessCategory]
  )

  const isEbitdaOnly = useMemo(() => isEbitdaOnlyContext(effectiveMethods), [effectiveMethods])

  const badgeKey = useMemo(() => {
    const methods = effectiveMethods.filter((method) => method !== 'upswitch_adaptive')
    const hasRevenue = methods.some((method) => isRevenueMethodologyKey(method))
    const hasEbitda = methods.includes('ebitda_multiple')
    if (hasRevenue && hasEbitda) return 'revenueQualityBadgeBoth'
    if (hasEbitda) return 'revenueQualityBadgeEbitda'
    return 'revenueQualityBadgeOmzet'
  }, [effectiveMethods])

  const totalFields = isEbitdaOnly ? 2 : 3
  const coreFilledCount = useMemo(() => {
    const coreFields = [revRecurringAmount, revTopClientAmount]
    if (isEbitdaOnly) {
      return coreFields.filter((value) => isFiniteNumeric(value)).length
    }
    const thirdField = isTechSaas ? revGrossChurnPct : revContractBacklog
    return [...coreFields, thirdField].filter((value) => isFiniteNumeric(value)).length
  }, [
    isEbitdaOnly,
    isTechSaas,
    revRecurringAmount,
    revTopClientAmount,
    revGrossChurnPct,
    revContractBacklog,
  ])

  const sectionComplete = useMemo(
    () =>
      isFiniteNumeric(revRecurringAmount) ||
      isFiniteNumeric(revTopClientAmount) ||
      isFiniteNumeric(revContractBacklog) ||
      isFiniteNumeric(revGrossChurnPct) ||
      isFiniteNumeric(revCapitalizedRdAmount),
    [
      revRecurringAmount,
      revTopClientAmount,
      revContractBacklog,
      revGrossChurnPct,
      revCapitalizedRdAmount,
    ]
  )

  const isReady = coreFilledCount >= totalFields
  const progressPct = (coreFilledCount / totalFields) * 100

  const recurringRevenuePct = useMemo(() => {
    if (!isFiniteNumeric(latestRevenue) || latestRevenue <= 0) return null
    if (!isFiniteNumeric(revRecurringAmount)) return null
    return (revRecurringAmount / latestRevenue) * 100
  }, [latestRevenue, revRecurringAmount])

  const topClientConcentrationPct = useMemo(() => {
    if (latestRevenue == null || !Number.isFinite(latestRevenue) || latestRevenue <= 0) return null
    if (revTopClientAmount == null || !Number.isFinite(revTopClientAmount)) return null
    return (revTopClientAmount / latestRevenue) * 100
  }, [latestRevenue, revTopClientAmount])

  const backlogMonths = useMemo(() => {
    if (latestRevenue == null || !Number.isFinite(latestRevenue) || latestRevenue <= 0) return null
    if (revContractBacklog == null || !Number.isFinite(revContractBacklog)) return null
    return (revContractBacklog / latestRevenue) * 12
  }, [latestRevenue, revContractBacklog])

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
      aria-label={isEbitdaOnly ? t('sections.ebitdaQuality') : t('sections.revenueQuality')}
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={isEbitdaOnly ? t('sections.ebitdaQuality') : t('sections.revenueQuality')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t(badgeKey)}
          </span>
        }
      />

      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
            {t('revenueQualityPanels.startLeadTitle')}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isEbitdaOnly ? t('fields.ebitdaQualityLead') : t('fields.revenueQualityLead')}
          </p>
          <p className="text-[11px] text-foreground/45">
            {isEbitdaOnly
              ? t('revenueQualityPanels.quickStartEbitda')
              : isTechSaas
                ? t('revenueQualityPanels.quickStartTech')
                : t('revenueQualityPanels.quickStartRevenue')}
          </p>
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
              ? t('revenueQualityPanels.ready')
              : t('revenueQualityPanels.progress', { filled: coreFilledCount, total: totalFields })}
          </p>
        </div>
        {!isReady && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {isEbitdaOnly
              ? t('revenueQualityPanels.minimumHintEbitda')
              : isTechSaas
                ? t('revenueQualityPanels.minimumHintTech')
                : t('revenueQualityPanels.minimumHintRevenue')}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
            {t('revenueQualityPanels.startHereTitle')}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isEbitdaOnly
              ? t('revenueQualityPanels.startHereDescriptionEbitda')
              : isTechSaas
                ? t('revenueQualityPanels.startHereDescriptionTech')
                : t('revenueQualityPanels.startHereDescriptionRevenue')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <CurrencyInput
            label={t('fields.revRecurringCurrency')}
            value={revRecurringAmount}
            onChange={(v) => onFieldChange('rev_recurring_amount', v)}
            placeholder="400.000"
            disabled={disabled}
            description={t('fields.revRecurringCurrencyDescription')}
            truncateLabel={false}
          />

          <CurrencyInput
            label={
              isEbitdaOnly
                ? t('fields.revTopClientCurrencyEbitda')
                : t('fields.revTopClientCurrency')
            }
            value={revTopClientAmount}
            onChange={(v) => onFieldChange('rev_top_client_amount', v)}
            placeholder="150.000"
            disabled={disabled}
            description={
              isEbitdaOnly
                ? t('fields.revTopClientCurrencyEbitdaTooltip')
                : t('fields.revTopClientCurrencyTooltip')
            }
            truncateLabel={false}
          />
        </div>

        {isEbitdaOnly ? (
          isTechSaas && (
            <CurrencyInput
              label={t('fields.revCapitalizedRd')}
              value={revCapitalizedRdAmount}
              onChange={(v) => onFieldChange('rev_capitalized_rd_amount', v)}
              size="sm"
              placeholder="50.000"
              disabled={disabled}
              description={t('fields.revCapitalizedRdDescription')}
              truncateLabel={false}
            />
          )
        ) : isTechSaas ? (
          <div className="grid grid-cols-1 gap-3">
            <AdaptivePercentInput
              label={t('fields.revGrossChurnPct')}
              value={revGrossChurnPct}
              onChange={(v) => onFieldChange('rev_gross_churn_pct', v)}
              placeholder="8"
              disabled={disabled}
              description={t('fields.revGrossChurnTooltip')}
              truncateLabel={false}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <CurrencyInput
              label={t('fields.revContractBacklog')}
              value={revContractBacklog}
              onChange={(v) => onFieldChange('rev_contract_backlog', v)}
              size="sm"
              placeholder="250.000"
              disabled={disabled}
              description={t('fields.revContractBacklogDescription')}
              truncateLabel={false}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
            {t('sections.revenueQualityDerivedMetrics')}
          </h4>
          <span className="text-[10px] text-foreground/45">
            {t('fields.revenueQualityPreviewFootnote')}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <PreviewMetricCard
            label={t('fields.revRecurringPct')}
            value={
              recurringRevenuePct != null
                ? `${ratioFormatter.format(recurringRevenuePct)}%`
                : revRecurringAmount != null && Number.isFinite(revRecurringAmount)
                  ? currencyFormatter.format(revRecurringAmount)
                  : '—'
            }
          />
          <PreviewMetricCard
            label={t('fields.revTopClientConcentrationPct')}
            value={
              topClientConcentrationPct != null
                ? `${ratioFormatter.format(topClientConcentrationPct)}%`
                : revTopClientAmount != null && Number.isFinite(revTopClientAmount)
                  ? currencyFormatter.format(revTopClientAmount)
                  : '—'
            }
          />
          <PreviewMetricCard
            label={t('fields.revenueQualityBacklogMonths')}
            value={
              backlogMonths != null
                ? `${ratioFormatter.format(backlogMonths)} ${t('fields.revenueQualityMonthsSuffix')}`
                : '—'
            }
          />
        </div>
      </div>
    </motion.section>
  )
}
