'use client'

import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, type ReactNode } from 'react'
import {
  computeEstimatedNav,
  computeGrossPositiveAdjustments,
  computeNavAdjustmentsSum,
  computeTaxLatencyDeduction,
  countFilledNavProgressFields,
  NAV_DEFAULT_TAX_LATENCY_PCT,
  NAV_PROGRESS_TOTAL_FIELDS,
  NAV_SECTOR_DEFAULTS,
  resolveNavSectorKey,
  useManualPreviewFormatters,
} from '@/lib/omniPreview'
import { cn } from '@/design-system/utils'
import { CurrencyInput } from '../CurrencyInput'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { PreviewMetricCard } from './previewMetricCards'
import { ValuationSectionHeader } from './ValuationSectionHeader'

function NavPanel({
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
      navTaxLatencyPct,
      navOffBalanceItems,
    }),
    [
      navRealEstateAdjustment,
      navInventoryAdjustment,
      navHiddenReserves,
      navGoodwillWriteoff,
      navReceivablesAdjustment,
      navOtherRevaluations,
      navTaxLatencyPct,
      navOffBalanceItems,
    ]
  )

  const filledCount = useMemo(() => countFilledNavProgressFields(inputs), [inputs])
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
  const progressPct = (filledCount / NAV_PROGRESS_TOTAL_FIELDS) * 100

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
      className="mt-6 space-y-4 pt-2"
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

      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
            {t('navPanels.startLeadTitle')}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('fields.navLead')}</p>
          <p className="text-[11px] text-foreground/45">{t('fields.navQuickStart')}</p>
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
              ? t('sections.navProgressReady')
              : t('sections.navProgressHint', {
                  filled: filledCount,
                  total: NAV_PROGRESS_TOTAL_FIELDS,
                })}
          </p>
        </div>
        {!isReady && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('sections.navProgressMinimumHint')}
          </p>
        )}

        {hasDefaults && filledCount === 0 && (
          <button
            type="button"
            onClick={applyDefaults}
            disabled={disabled}
            className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-left text-xs font-medium text-primary/80 transition-colors hover:bg-primary/[0.08] disabled:opacity-50"
          >
            {t('sections.navDefaultsButton')}
          </button>
        )}
      </div>

      <NavPanel
        title={t('navPanels.startHereTitle')}
        description={t('navPanels.startHereDescription')}
      >
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
            label={t('fields.navOffBalanceItems')}
            value={navOffBalanceItems}
            onChange={(v) => onFieldChange('nav_off_balance_items', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navOffBalanceItemsDesc')}
          />
        </div>
      </NavPanel>

      <NavPanel
        title={t('navPanels.assetsTitle')}
        description={t('navPanels.assetsDescription')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CurrencyInput
            label={t('fields.navGoodwillWriteoff')}
            value={navGoodwillWriteoff}
            onChange={(v) => onFieldChange('nav_goodwill_writeoff', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navGoodwillWriteoffDesc')}
          />
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
            label={t('fields.navOtherRevaluations')}
            value={navOtherRevaluations}
            onChange={(v) => onFieldChange('nav_other_revaluations', v)}
            size="sm"
            placeholder="0"
            disabled={disabled}
            description={t('fields.navOtherRevaluationsDesc')}
          />
        </div>
      </NavPanel>

      <NavPanel
        title={t('navPanels.deductionsTitle')}
        description={t('navPanels.deductionsDescription')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdaptivePercentInput
            label={t('fields.navTaxLatencyPct')}
            value={navTaxLatencyPct}
            onChange={(v) => onFieldChange('nav_tax_latency_pct', v)}
            placeholder={countryCode?.startsWith('BE') ? '25' : '0'}
            disabled={disabled}
            description={t('fields.navTaxLatencyPctDesc')}
          />
        </div>
      </NavPanel>

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
