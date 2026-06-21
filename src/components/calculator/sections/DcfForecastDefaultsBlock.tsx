'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Database, History } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { Switch } from '@/design-system/components/Switch'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import type { DcfGlobalAssumptionsVariant, DcfInputMode } from './DcfGlobalAssumptionsModel'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
} from './dcfEngineDefaults'

type DcfDefaultsProvenance = 'none' | 'history' | 'integration' | 'both'

interface DcfForecastDefaultsBlockProps {
  variant: DcfGlobalAssumptionsVariant
  dcfInputMode: DcfInputMode
  dcfRevenueGrowthPct?: number
  dcfEbitdaMarginPct?: number
  dcfCapexPct?: number
  dcfDaPct?: number
  dcfNwcPct?: number
  dcfTaxRatePct?: number
  dcfDefaultsProvenance: DcfDefaultsProvenance
  smartDefaultsPresent: boolean
  showDcfInputModeToggle: boolean
  dcfModeSegmentOptions?: { value: string; label: string }[]
  onDcfInputModeChange?: (mode: DcfInputMode) => void
  onFieldChange: (field: string, value: number | undefined) => void
  onApplyToForecastYears?: () => void
  canApplyToForecastYears: boolean
  forecastYearCount: number
  disabled?: boolean
}

export function DcfForecastDefaultsBlock({
  variant,
  dcfInputMode,
  dcfRevenueGrowthPct,
  dcfEbitdaMarginPct,
  dcfCapexPct,
  dcfDaPct,
  dcfNwcPct,
  dcfTaxRatePct,
  dcfDefaultsProvenance,
  smartDefaultsPresent,
  showDcfInputModeToggle,
  dcfModeSegmentOptions,
  onDcfInputModeChange,
  onFieldChange,
  onApplyToForecastYears,
  canApplyToForecastYears,
  forecastYearCount,
  disabled,
}: DcfForecastDefaultsBlockProps) {
  const t = useTranslations('manualInput.methodSelector')
  const tManual = useTranslations('manualInput')
  const [showAdvancedDrivers, setShowAdvancedDrivers] = useState(false)

  const advancedDriverSummary = t('advancedDriversSummary', {
    capex: (dcfCapexPct ?? DCF_DEFAULT_CAPEX_PCT).toFixed(1),
    da: (dcfDaPct ?? DCF_DEFAULT_DA_PCT).toFixed(1),
    nwc: (dcfNwcPct ?? DCF_DEFAULT_NWC_PCT).toFixed(1),
    tax: (dcfTaxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT).toFixed(1),
  })

  return (
    <div className="space-y-3">
      {variant === 'full' && (
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {t('globalAssumptionGroups.forecastDefaults')}
        </h4>
      )}

      {variant === 'forecastDefaultsOnly' && dcfInputMode === 'ebitda' && (
        <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
          {t('forecastDefaultsLead')}
        </p>
      )}

      {variant === 'forecastDefaultsOnly' && dcfInputMode === 'ebitda' && !smartDefaultsPresent && (
        <div
          className="-mt-0.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2"
          role="note"
        >
          <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-200/90">
            {t('forecastDefaultsNoHistoryNote')}
          </p>
        </div>
      )}

      {variant === 'forecastDefaultsOnly' && dcfDefaultsProvenance !== 'none' && (
        <div
          className="-mt-0.5 flex flex-wrap items-center gap-1.5"
          role="status"
          aria-label={t('forecastDefaultsProvenanceAria')}
        >
          <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-primary/15 bg-primary/[0.06] px-2 py-1 text-[10px] font-medium leading-tight text-primary/85 ring-1 ring-inset ring-primary/10">
            {dcfDefaultsProvenance === 'both' && (
              <>
                <History className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                <Database className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                <span>{t('forecastDefaultsProvenance.both')}</span>
              </>
            )}
            {dcfDefaultsProvenance === 'history' && (
              <>
                <History className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                <span>{t('forecastDefaultsProvenance.history')}</span>
              </>
            )}
            {dcfDefaultsProvenance === 'integration' && (
              <>
                <Database className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                <span>{t('forecastDefaultsProvenance.integration')}</span>
              </>
            )}
          </span>
          <p className="text-[10px] leading-snug text-muted-foreground">
            {t('forecastDefaultsEditableHint')}
          </p>
        </div>
      )}

      {showDcfInputModeToggle && dcfModeSegmentOptions && onDcfInputModeChange && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
            {t('dcfInputModeLabelEmbedded')}
          </span>
          <SegmentedControl
            value={dcfInputMode}
            onChange={(value) => onDcfInputModeChange(value as DcfInputMode)}
            options={dcfModeSegmentOptions}
            disabled={disabled}
            size="sm"
            fullWidth
            aria-label={t('dcfInputModeLabelEmbedded')}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {dcfInputMode === 'fcff_only'
              ? tManual('dcfInputMode.fcffOnlyHint')
              : tManual('dcfInputMode.ebitdaHint')}
          </p>
        </div>
      )}

      {dcfInputMode === 'fcff_only' ? (
        <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('fcffOnlyForecastDefaultsNotice')}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            <AdaptivePercentInput
              label={t('fields.dcfRevenueGrowthPct')}
              value={dcfRevenueGrowthPct}
              onChange={(value) => onFieldChange('dcf_revenue_growth_pct', value)}
              placeholder={String(DCF_DEFAULT_REVENUE_GROWTH_PCT)}
              disabled={disabled}
              truncateLabel={false}
            />
            <AdaptivePercentInput
              label={t('fields.dcfEbitdaMarginPct')}
              value={dcfEbitdaMarginPct}
              onChange={(value) => onFieldChange('dcf_ebitda_margin_pct', value)}
              placeholder={String(DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT)}
              disabled={disabled}
              truncateLabel={false}
            />
          </div>
          <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3">
            <div className="space-y-2">
              <Switch
                size="sm"
                checked={showAdvancedDrivers}
                onChange={(next) => setShowAdvancedDrivers(next)}
                disabled={disabled}
                label={t('advancedDriversTitle')}
                labelPosition="right"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {advancedDriverSummary}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('advancedDriversHelp')}
              </p>
            </div>
            <AnimatePresence initial={false}>
              {showAdvancedDrivers && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="mt-3 grid grid-cols-1 gap-3 border-t border-primary/10 pt-3"
                >
                  <AdaptivePercentInput
                    label={t('fields.dcfCapexPct')}
                    value={dcfCapexPct}
                    onChange={(value) => onFieldChange('dcf_capex_pct', value)}
                    placeholder={String(DCF_DEFAULT_CAPEX_PCT)}
                    disabled={disabled}
                    truncateLabel={false}
                  />
                  <AdaptivePercentInput
                    label={t('fields.dcfDaPct')}
                    value={dcfDaPct}
                    onChange={(value) => onFieldChange('dcf_da_pct', value)}
                    placeholder={String(DCF_DEFAULT_DA_PCT)}
                    disabled={disabled}
                    truncateLabel={false}
                  />
                  <AdaptivePercentInput
                    label={t('fields.dcfNwcPct')}
                    description={t('fieldHints.dcfNwcPct')}
                    value={dcfNwcPct}
                    onChange={(value) => onFieldChange('dcf_nwc_pct', value)}
                    placeholder={String(DCF_DEFAULT_NWC_PCT)}
                    disabled={disabled}
                    truncateLabel={false}
                  />
                  <AdaptivePercentInput
                    label={t('fields.dcfTaxRatePct')}
                    value={dcfTaxRatePct}
                    onChange={(value) => onFieldChange('dcf_tax_rate_pct', value)}
                    placeholder={String(DCF_DEFAULT_TAX_RATE_PCT)}
                    disabled={disabled}
                    truncateLabel={false}
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('dcfCapexFootnote')}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {onApplyToForecastYears && (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/10 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('applyForecastYearsDescription', { count: forecastYearCount })}
              </p>
              <button
                type="button"
                onClick={onApplyToForecastYears}
                disabled={disabled || !canApplyToForecastYears}
                className="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/35 hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-primary/40 disabled:hover:bg-background"
              >
                {t('applyForecastYears')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
