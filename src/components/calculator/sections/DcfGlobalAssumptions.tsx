'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Database, History } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { Switch } from '@/design-system/components/Switch'
import { cn } from '@/design-system/utils'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
  DCF_DEFAULT_TERMINAL_GROWTH_PCT,
} from './dcfEngineDefaults'
import { ValuationSectionHeader } from './ValuationSectionHeader'
import { WaccBreakdownPanel } from './WaccBreakdownPanel'

export type TerminalValueMethod = 'perpetual_growth' | 'exit_multiple'

/** `full` = single block (AdaptiveSections). Embedded DCF uses `forecastDefaultsOnly` then `discountTerminalOnly` after the forecast table. */
export type DcfGlobalAssumptionsVariant = 'full' | 'forecastDefaultsOnly' | 'discountTerminalOnly'

interface DcfGlobalAssumptionsProps {
  step: number
  variant?: DcfGlobalAssumptionsVariant
  dcfRevenueGrowthPct?: number
  dcfEbitdaMarginPct?: number
  dcfCapexPct?: number
  dcfDaPct?: number
  dcfNwcPct?: number
  dcfTaxRatePct?: number
  dcfWaccPct?: number
  dcfTerminalGrowthPct?: number
  dcfExitMultiple?: number
  dcfRiskFreeRatePct?: number
  dcfEquityRiskPremiumPct?: number
  dcfBeta?: number
  dcfCostOfDebtPct?: number
  dcfDebtEquityPct?: number
  dcfTaxShieldPct?: number
  terminalValueMethod: TerminalValueMethod
  onTerminalValueMethodChange: (method: TerminalValueMethod) => void
  onFieldChange: (field: string, value: number | undefined) => void
  onApplyToForecastYears?: () => void
  canApplyToForecastYears?: boolean
  forecastYearCount?: number
  /** When FCFF-only, exit multiple is not supported (no EBITDA on forecast rows); terminal value uses Gordon growth. */
  dcfInputMode?: 'ebitda' | 'fcff_only'
  /** When `forecastDefaultsOnly`, renders the Via EBITDA / FCFF-only toggle above the percentage grid. */
  showDcfInputModeToggle?: boolean
  dcfModeSegmentOptions?: { value: string; label: string }[]
  onDcfInputModeChange?: (mode: 'ebitda' | 'fcff_only') => void
  disabled?: boolean
  className?: string
  /**
   * Where automatic DCF % suggestions come from (Venus ↔ Titan/Mercury import pipeline).
   * Only shown for `forecastDefaultsOnly`.
   */
  dcfDefaultsProvenance?: 'none' | 'history' | 'integration' | 'both'
}

const terminalMethodOptions: { value: TerminalValueMethod; label: string }[] = [
  { value: 'perpetual_growth', label: '' },
  { value: 'exit_multiple', label: '' },
]

export function DcfGlobalAssumptions({
  step,
  variant = 'full',
  dcfRevenueGrowthPct,
  dcfEbitdaMarginPct,
  dcfCapexPct,
  dcfDaPct,
  dcfNwcPct,
  dcfTaxRatePct,
  dcfWaccPct,
  dcfTerminalGrowthPct,
  dcfExitMultiple,
  dcfRiskFreeRatePct,
  dcfEquityRiskPremiumPct,
  dcfBeta,
  dcfCostOfDebtPct,
  dcfDebtEquityPct,
  dcfTaxShieldPct,
  terminalValueMethod,
  onTerminalValueMethodChange,
  onFieldChange,
  onApplyToForecastYears,
  canApplyToForecastYears = false,
  forecastYearCount = 0,
  dcfInputMode = 'ebitda',
  showDcfInputModeToggle = false,
  dcfModeSegmentOptions,
  onDcfInputModeChange,
  disabled,
  className,
  dcfDefaultsProvenance = 'none',
}: DcfGlobalAssumptionsProps) {
  const t = useTranslations('manualInput.methodSelector')
  const [showAdvancedDrivers, setShowAdvancedDrivers] = useState(true)

  const segmentOptions = terminalMethodOptions.map((opt) => ({
    ...opt,
    label: t(`terminalMethod.${opt.value}` as const),
  }))
  const terminalSegmentOptions =
    dcfInputMode === 'fcff_only'
      ? segmentOptions.filter((o) => o.value === 'perpetual_growth')
      : segmentOptions

  const forecastDefaultsComplete = useMemo(() => {
    if (dcfInputMode === 'fcff_only') return true
    const g = dcfRevenueGrowthPct
    const m = dcfEbitdaMarginPct
    return (
      typeof g === 'number' && Number.isFinite(g) && typeof m === 'number' && Number.isFinite(m)
    )
  }, [dcfRevenueGrowthPct, dcfEbitdaMarginPct, dcfInputMode])

  const globalAssumptionsComplete = useMemo(() => {
    const waccOk = dcfWaccPct != null && Number.isFinite(dcfWaccPct) && dcfWaccPct > 0
    const effectiveTerminal =
      dcfInputMode === 'fcff_only' ? 'perpetual_growth' : terminalValueMethod
    const terminalOk =
      effectiveTerminal === 'perpetual_growth'
        ? dcfTerminalGrowthPct != null && Number.isFinite(dcfTerminalGrowthPct)
        : dcfExitMultiple != null && Number.isFinite(dcfExitMultiple) && dcfExitMultiple > 0
    return waccOk && terminalOk
  }, [dcfWaccPct, terminalValueMethod, dcfTerminalGrowthPct, dcfExitMultiple, dcfInputMode])

  const sectionComplete =
    variant === 'forecastDefaultsOnly'
      ? forecastDefaultsComplete
      : variant === 'discountTerminalOnly'
        ? globalAssumptionsComplete
        : globalAssumptionsComplete

  const sectionTitle =
    variant === 'forecastDefaultsOnly'
      ? t('sections.dcfForecastDefaults')
      : variant === 'discountTerminalOnly'
        ? t('sections.dcfDiscountAndTerminal')
        : t('sections.dcfGlobalAssumptions')

  const sectionAria =
    variant === 'forecastDefaultsOnly'
      ? t('sections.dcfForecastDefaultsAria')
      : variant === 'discountTerminalOnly'
        ? t('sections.dcfDiscountAndTerminalAria')
        : t('sections.dcfGlobalAssumptions')
  const advancedDriverSummary = useMemo(
    () =>
      t('advancedDriversSummary', {
        capex: (dcfCapexPct ?? DCF_DEFAULT_CAPEX_PCT).toFixed(1),
        da: (dcfDaPct ?? DCF_DEFAULT_DA_PCT).toFixed(1),
        nwc: (dcfNwcPct ?? DCF_DEFAULT_NWC_PCT).toFixed(1),
        tax: (dcfTaxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT).toFixed(1),
      }),
    [t, dcfCapexPct, dcfDaPct, dcfNwcPct, dcfTaxRatePct]
  )

  const showForecastDefaultsBlock = variant === 'full' || variant === 'forecastDefaultsOnly'
  const showDiscountTerminalBlock = variant === 'full' || variant === 'discountTerminalOnly'

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('space-y-5 pt-2', className)}
      aria-label={sectionAria}
    >
      <ValuationSectionHeader complete={sectionComplete} step={step} title={sectionTitle} />

      {variant === 'discountTerminalOnly' && (
        <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
          {t('sections.discountTerminalLead')}
        </p>
      )}

      {variant === 'forecastDefaultsOnly' && (
        <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
          {t('forecastDefaultsLead')}
        </p>
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

      {showDcfInputModeToggle &&
        variant === 'forecastDefaultsOnly' &&
        dcfModeSegmentOptions &&
        onDcfInputModeChange && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-medium text-foreground/70">
              {t('dcfInputModeLabelEmbedded')}
            </span>
            <SegmentedControl
              value={dcfInputMode}
              onChange={(v) => onDcfInputModeChange(v as 'ebitda' | 'fcff_only')}
              options={dcfModeSegmentOptions}
              disabled={disabled}
              size="sm"
              className="max-w-md"
            />
          </div>
        )}

      {/* Forecast defaults: growth, margin, and FCFF bridge drivers */}
      {showForecastDefaultsBlock && (
        <div className="space-y-3">
          {variant === 'full' && (
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('globalAssumptionGroups.forecastDefaults')}
            </h4>
          )}
          {dcfInputMode === 'fcff_only' ? (
            <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('fcffOnlyForecastDefaultsNotice')}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AdaptivePercentInput
                  label={t('fields.dcfRevenueGrowthPct')}
                  value={dcfRevenueGrowthPct}
                  onChange={(v) => onFieldChange('dcf_revenue_growth_pct', v)}
                  placeholder={String(DCF_DEFAULT_REVENUE_GROWTH_PCT)}
                  disabled={disabled}
                />
                <AdaptivePercentInput
                  label={t('fields.dcfEbitdaMarginPct')}
                  value={dcfEbitdaMarginPct}
                  onChange={(v) => onFieldChange('dcf_ebitda_margin_pct', v)}
                  placeholder={String(DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT)}
                  disabled={disabled}
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
                      className="mt-3 grid grid-cols-1 gap-3 border-t border-primary/10 pt-3 sm:grid-cols-2"
                    >
                      <AdaptivePercentInput
                        label={t('fields.dcfCapexPct')}
                        value={dcfCapexPct}
                        onChange={(v) => onFieldChange('dcf_capex_pct', v)}
                        placeholder={String(DCF_DEFAULT_CAPEX_PCT)}
                        disabled={disabled}
                      />
                      <AdaptivePercentInput
                        label={t('fields.dcfDaPct')}
                        value={dcfDaPct}
                        onChange={(v) => onFieldChange('dcf_da_pct', v)}
                        placeholder={String(DCF_DEFAULT_DA_PCT)}
                        disabled={disabled}
                      />
                      <AdaptivePercentInput
                        label={t('fields.dcfNwcPct')}
                        description={t('fieldHints.dcfNwcPct')}
                        value={dcfNwcPct}
                        onChange={(v) => onFieldChange('dcf_nwc_pct', v)}
                        placeholder={String(DCF_DEFAULT_NWC_PCT)}
                        disabled={disabled}
                      />
                      <AdaptivePercentInput
                        label={t('fields.dcfTaxRatePct')}
                        value={dcfTaxRatePct}
                        onChange={(v) => onFieldChange('dcf_tax_rate_pct', v)}
                        placeholder={String(DCF_DEFAULT_TAX_RATE_PCT)}
                        disabled={disabled}
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
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
      )}

      {/* Discount rate + terminal value */}
      {showDiscountTerminalBlock && (
        <>
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('globalAssumptionGroups.discountRate')}
            </h4>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('fieldHints.dcfWaccSummary')}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WaccBreakdownPanel
                currentWaccPct={dcfWaccPct}
                riskFreeRatePct={dcfRiskFreeRatePct}
                equityRiskPremiumPct={dcfEquityRiskPremiumPct}
                beta={dcfBeta}
                costOfDebtPct={dcfCostOfDebtPct}
                debtEquityPct={dcfDebtEquityPct}
                taxShieldPct={dcfTaxShieldPct}
                onFieldChange={onFieldChange}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('globalAssumptionGroups.terminalValue')}
            </h4>
            {dcfInputMode === 'fcff_only' && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('fcffOnlyTerminalNotice')}
              </p>
            )}
            {dcfInputMode !== 'fcff_only' && (
              <SegmentedControl
                options={terminalSegmentOptions}
                value={terminalValueMethod}
                onChange={onTerminalValueMethodChange}
                size="sm"
                aria-label={t('terminalMethodAriaLabel')}
              />
            )}
            <AnimatePresence mode="wait" initial={false}>
              {(dcfInputMode === 'fcff_only' || terminalValueMethod === 'perpetual_growth') && (
                <motion.div
                  key="perpetual_growth"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <div className="space-y-1 sm:col-span-2">
                    <AdaptivePercentInput
                      label={t('fields.dcfTerminalGrowthPct')}
                      value={dcfTerminalGrowthPct}
                      onChange={(v) => onFieldChange('dcf_terminal_growth_pct', v)}
                      placeholder={String(DCF_DEFAULT_TERMINAL_GROWTH_PCT)}
                      disabled={disabled}
                    />
                    {dcfTerminalGrowthPct != null &&
                      Number.isFinite(dcfTerminalGrowthPct) &&
                      dcfTerminalGrowthPct > 3 && (
                        <p
                          className="text-[10px] leading-snug text-amber-800 dark:text-amber-200/90"
                          role="note"
                        >
                          {t('terminalGrowthHighWarning')}
                        </p>
                      )}
                  </div>
                </motion.div>
              )}
              {dcfInputMode !== 'fcff_only' && terminalValueMethod === 'exit_multiple' && (
                <motion.div
                  key="exit_multiple"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <AdaptivePercentInput
                    label={t('fields.dcfExitMultiple')}
                    value={dcfExitMultiple}
                    onChange={(v) => onFieldChange('dcf_exit_multiple', v)}
                    placeholder="6.0"
                    disabled={disabled}
                    step="0.1"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </motion.section>
  )
}
