'use client'

import { motion } from 'framer-motion'
import { Building2, Info, Layers, ShieldMinus, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo } from 'react'
import {
  computeEstimatedNav,
  computeGrossPositiveAdjustments,
  computeNavAdjustmentsSum,
  computeTaxLatencyDeduction,
  countFilledNavFields,
  NAV_DEFAULT_TAX_LATENCY_PCT,
  NAV_SECTOR_DEFAULTS,
  NAV_TOTAL_FIELDS,
  resolveNavSectorKey,
  useManualPreviewFormatters,
} from '@/lib/omniPreview'
import { cn } from '@/design-system/utils'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

function NavGroupHeader({
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

interface NavAssetScheduleSectionProps {
  step: number
  navRealEstateAdjustment?: number
  navInventoryAdjustment?: number
  navHiddenReserves?: number
  navGoodwillWriteoff?: number
  navReceivablesAdjustment?: number
  navOtherRevaluations?: number
  navTaxLatencyPct?: number
  navOffBalanceItems?: number
  totalAssets?: number
  totalLiabilities?: number
  businessType?: string | null
  countryCode?: string
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

export function NavAssetScheduleSection({
  step,
  navRealEstateAdjustment,
  navInventoryAdjustment,
  navHiddenReserves,
  navGoodwillWriteoff,
  navReceivablesAdjustment,
  navOtherRevaluations,
  navTaxLatencyPct,
  navOffBalanceItems,
  totalAssets,
  totalLiabilities,
  businessType,
  countryCode,
  onFieldChange,
  disabled,
}: NavAssetScheduleSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { currency: currencyFormatter } = useManualPreviewFormatters()

  const inputs = useMemo(
    () => ({
      navRealEstateAdjustment,
      navInventoryAdjustment,
      navHiddenReserves,
      navGoodwillWriteoff,
      navReceivablesAdjustment,
      navOtherRevaluations,
    }),
    [
      navRealEstateAdjustment,
      navInventoryAdjustment,
      navHiddenReserves,
      navGoodwillWriteoff,
      navReceivablesAdjustment,
      navOtherRevaluations,
    ]
  )

  const filledCount = useMemo(() => countFilledNavFields(inputs), [inputs])
  const grossAdjustmentSum = useMemo(() => computeNavAdjustmentsSum(inputs), [inputs])
  const grossPositiveAdjustments = useMemo(() => computeGrossPositiveAdjustments(inputs), [inputs])

  const effectiveTaxPct = navTaxLatencyPct ?? (countryCode?.startsWith('BE') ? NAV_DEFAULT_TAX_LATENCY_PCT : undefined)

  const taxDeduction = useMemo(
    () => computeTaxLatencyDeduction(grossPositiveAdjustments, effectiveTaxPct),
    [grossPositiveAdjustments, effectiveTaxPct]
  )

  const estimatedNav = useMemo(
    () =>
      computeEstimatedNav(
        totalAssets,
        totalLiabilities,
        grossAdjustmentSum,
        grossPositiveAdjustments,
        effectiveTaxPct,
        navOffBalanceItems
      ),
    [totalAssets, totalLiabilities, grossAdjustmentSum, grossPositiveAdjustments, effectiveTaxPct, navOffBalanceItems]
  )

  const sectionComplete = filledCount > 0
  const isReady = filledCount >= 2

  const sectorKey = useMemo(() => resolveNavSectorKey(businessType), [businessType])
  const hasDefaults = sectorKey != null && sectorKey in NAV_SECTOR_DEFAULTS

  const applyDefaults = useCallback(() => {
    if (!sectorKey) return
    const defaults = NAV_SECTOR_DEFAULTS[sectorKey]
    if (!defaults) return
    const fieldMap: Record<string, string> = {
      navRealEstateAdjustment: 'nav_real_estate_adjustment',
      navInventoryAdjustment: 'nav_inventory_adjustment',
      navHiddenReserves: 'nav_hidden_reserves',
      navGoodwillWriteoff: 'nav_goodwill_writeoff',
      navReceivablesAdjustment: 'nav_receivables_adjustment',
      navOtherRevaluations: 'nav_other_revaluations',
    }
    for (const [camel, val] of Object.entries(defaults)) {
      const snakeKey = fieldMap[camel]
      if (snakeKey != null && val != null) {
        onFieldChange(snakeKey, val)
      }
    }
  }, [sectorKey, onFieldChange])

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-5 pt-2"
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={t('sections.navAssetSchedule')}
        badge={
          <span className="rounded-full bg-primary/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
            {t('recommendedForMethod', { method: 'NAV' })}
          </span>
        }
      />

      {/* Explainer callout */}
      <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-3.5 py-3 text-[12px] leading-relaxed text-foreground/50 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-primary/50 mt-0.5 shrink-0" />
        <span>{t('sections.navExplainer')}</span>
      </div>

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
              animate={{ width: `${(filledCount / NAV_TOTAL_FIELDS) * 100}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>
        <p className="text-[10px] text-foreground/45 whitespace-nowrap">
          {isReady
            ? t('sections.navProgressReady')
            : t('sections.navProgressHint', { filled: filledCount, total: NAV_TOTAL_FIELDS })}
        </p>
      </div>

      {/* Sector defaults button */}
      {hasDefaults && filledCount === 0 && (
        <button
          type="button"
          onClick={applyDefaults}
          disabled={disabled}
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-xs font-medium text-primary/80 transition-colors hover:bg-primary/[0.08] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t('sections.navDefaultsButton')}
        </button>
      )}

      {/* Group 1: Fixed assets */}
      <div className="space-y-2.5">
        <NavGroupHeader
          icon={Building2}
          title={t('sections.navGroupFixedAssets')}
          hint={t('sections.navGroupFixedAssetsHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencyInput
            label={t('fields.navRealEstateAdjustment')}
            value={navRealEstateAdjustment}
            onChange={(v) => onFieldChange('nav_real_estate_adjustment', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navRealEstateAdjustmentDesc')}
          />
          <CurrencyInput
            label={t('fields.navGoodwillWriteoff')}
            value={navGoodwillWriteoff}
            onChange={(v) => onFieldChange('nav_goodwill_writeoff', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navGoodwillWriteoffDesc')}
          />
        </div>
      </div>

      {/* Group 2: Current assets & reserves */}
      <div className="space-y-2.5">
        <NavGroupHeader
          icon={Layers}
          title={t('sections.navGroupCurrentAndReserves')}
          hint={t('sections.navGroupCurrentAndReservesHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencyInput
            label={t('fields.navInventoryAdjustment')}
            value={navInventoryAdjustment}
            onChange={(v) => onFieldChange('nav_inventory_adjustment', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navInventoryAdjustmentDesc')}
          />
          <CurrencyInput
            label={t('fields.navHiddenReserves')}
            value={navHiddenReserves}
            onChange={(v) => onFieldChange('nav_hidden_reserves', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navHiddenReservesDesc')}
          />
          <CurrencyInput
            label={t('fields.navReceivablesAdjustment')}
            value={navReceivablesAdjustment}
            onChange={(v) => onFieldChange('nav_receivables_adjustment', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            allowNegative
            description={t('fields.navReceivablesAdjustmentDesc')}
          />
          <CurrencyInput
            label={t('fields.navOtherRevaluations')}
            value={navOtherRevaluations}
            onChange={(v) => onFieldChange('nav_other_revaluations', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navOtherRevaluationsDesc')}
          />
        </div>
      </div>

      {/* Group 3: Deductions */}
      <div className="space-y-2.5">
        <NavGroupHeader
          icon={ShieldMinus}
          title={t('sections.navGroupDeductions')}
          hint={t('sections.navGroupDeductionsHint')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdaptivePercentInput
            label={t('fields.navTaxLatencyPct')}
            value={navTaxLatencyPct}
            onChange={(v) => onFieldChange('nav_tax_latency_pct', v)}
            placeholder={countryCode?.startsWith('BE') ? '25' : '0'}
            disabled={disabled}
            description={t('fields.navTaxLatencyPctDesc')}
          />
          <CurrencyInput
            label={t('fields.navOffBalanceItems')}
            value={navOffBalanceItems}
            onChange={(v) => onFieldChange('nav_off_balance_items', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navOffBalanceItemsDesc')}
          />
        </div>
      </div>

      {/* Live preview panel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            {t('sections.navDerivedMetrics')}
          </h4>
          <span className="text-[10px] text-foreground/45">{t('fields.navPreviewFootnote')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <PreviewMetricCard
            label={t('fields.navAdjustmentsSum')}
            value={currencyFormatter.format(grossAdjustmentSum)}
          />
          <PreviewMetricCard
            label={t('fields.navTaxLatencyDeduction')}
            value={taxDeduction !== 0 ? currencyFormatter.format(taxDeduction) : '—'}
          />
          <PreviewMetricCard
            label={t('fields.navEstimatedNav')}
            value={estimatedNav != null ? currencyFormatter.format(estimatedNav) : '—'}
            hint={
              estimatedNav != null
                ? t('fields.navSynthesisHint')
                : t('fields.navEstimatedNavUnavailable')
            }
          />
        </div>
      </div>
    </motion.section>
  )
}
