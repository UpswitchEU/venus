'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { cn } from '@/design-system/utils'
import { AcademicValidationNotice } from './AcademicValidationNotice'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { DcfForecastDefaultsBlock } from './DcfForecastDefaultsBlock'
import {
  buildDcfGlobalAssumptionsSectionState,
  buildDcfGlobalAssumptionsSeedPatch,
  DCF_DISCOUNTING_CONVENTION_VALUES,
  type DcfDiscountingConvention,
  type DcfGlobalAssumptionsVariant,
  type DcfSeedSmartDefaults,
  isDcfPerpetualSpreadValid,
  TERMINAL_METHOD_VALUES,
  type TerminalValueMethod,
} from './DcfGlobalAssumptionsModel'
import { DCF_DEFAULT_TERMINAL_GROWTH_PCT } from './dcfEngineDefaults'
import { ValuationSectionHeader } from './ValuationSectionHeader'
import { WaccBreakdownPanel } from './WaccBreakdownPanel'

export type {
  DcfDiscountingConvention,
  DcfGlobalAssumptionsVariant,
  TerminalValueMethod,
} from './DcfGlobalAssumptionsModel'

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
  dcfDiscountingConvention?: DcfDiscountingConvention
  terminalValueMethod: TerminalValueMethod
  onTerminalValueMethodChange: (method: TerminalValueMethod) => void
  onDiscountingConventionChange?: (convention: DcfDiscountingConvention) => void
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
  /**
   * Historical-derived defaults (CAGR for revenue growth, latest margin, sector WACC base).
   * When supplied, the seed effect prefers these over the static engine fallbacks
   * so blank inputs ship the actually-defensible value to the engine, not "3%".
   */
  smartDefaults?: DcfSeedSmartDefaults | null
  /** Integration-derived overrides (Titan/accounting pipeline). Highest priority for CapEx/D&A. */
  integrationCapexPct?: number | null
  integrationDaPct?: number | null
  /** Sector WACC band (Damodaran 2026, EU SMB) shown above the WACC input. */
  waccSectorBand?: {
    sectorLabel: string
    median: number
    min: number
    max: number
  } | null
}

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
  dcfDiscountingConvention = 'mid_year',
  terminalValueMethod,
  onTerminalValueMethodChange,
  onDiscountingConventionChange,
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
  smartDefaults,
  integrationCapexPct,
  integrationDaPct,
  waccSectorBand,
}: DcfGlobalAssumptionsProps) {
  const t = useTranslations('manualInput.methodSelector')
  const canRepairInitialZeroEbitdaMarginRef = useRef(dcfEbitdaMarginPct === 0)

  // Cap-ack state for the >5% terminal-growth hard-stop. Local-only (we don't
  // persist this on the request) — re-firing the gate after a fresh entry is
  // intentional. Pattern matches `project_normalization_bridge_phase1_2026_04_29.md`.
  const [terminalGrowthCapAck, setTerminalGrowthCapAck] = useState(false)

  const hasSmartDefaults = smartDefaults != null
  const smartRevenueGrowthPct = smartDefaults?.revenueGrowthPct
  const smartEbitdaMarginPct = smartDefaults?.ebitdaMarginPct
  const smartCapexPct = smartDefaults?.capexPct
  const smartDaPct = smartDefaults?.daPct
  const smartNwcPct = smartDefaults?.nwcPct
  const smartTaxRatePct = smartDefaults?.taxRatePct
  const smartWaccPct = smartDefaults?.waccPct
  const smartTerminalGrowthPct = smartDefaults?.terminalGrowthPct
  const smartExitMultiple = smartDefaults?.exitMultiple
  const smartDefaultsForSeed = useMemo<DcfSeedSmartDefaults | null>(() => {
    if (!hasSmartDefaults) return null
    return {
      revenueGrowthPct: smartRevenueGrowthPct,
      ebitdaMarginPct: smartEbitdaMarginPct,
      capexPct: smartCapexPct,
      daPct: smartDaPct,
      nwcPct: smartNwcPct,
      taxRatePct: smartTaxRatePct,
      waccPct: smartWaccPct,
      terminalGrowthPct: smartTerminalGrowthPct,
      exitMultiple: smartExitMultiple,
    }
  }, [
    hasSmartDefaults,
    smartRevenueGrowthPct,
    smartEbitdaMarginPct,
    smartCapexPct,
    smartDaPct,
    smartNwcPct,
    smartTaxRatePct,
    smartWaccPct,
    smartTerminalGrowthPct,
    smartExitMultiple,
  ])

  // Round-trip the *best available* default into form state when a field is blank
  // so the engine receives the value the user sees in the placeholder. Without this,
  // blank fields ship `undefined` and the backend's own fallback may diverge from
  // the placeholder (the same class of bug as the Three Towers Capital incident — see
  // memory/project_defensibility_gate_2026_04_29.md).
  //
  // Priority chain per field (best → worst, picked by `pick`):
  //   1. Integration override (Titan/accounting import) — only CapEx, D&A
  //   2. History-derived smart default (`deriveDcfSmartDefaults`)        — preferred
  //   3. Static engine fallback (`DCF_DEFAULT_*`)                         — last resort
  //
  // Only writes when the field is currently undefined (no overwrite of user edits).
  // Gated by `variant` / `dcfInputMode` so we don't seed irrelevant fields.
  useEffect(() => {
    const shouldRepairZeroEbitdaMargin =
      canRepairInitialZeroEbitdaMarginRef.current &&
      dcfEbitdaMarginPct === 0 &&
      (smartDefaultsForSeed?.ebitdaMarginPct ?? 0) > 0
    const seedPatch = buildDcfGlobalAssumptionsSeedPatch({
      disabled,
      variant,
      dcfInputMode,
      terminalValueMethod,
      repairZeroEbitdaMarginPlaceholder: shouldRepairZeroEbitdaMargin,
      currentValues: {
        dcfRevenueGrowthPct,
        dcfEbitdaMarginPct,
        dcfCapexPct,
        dcfDaPct,
        dcfNwcPct,
        dcfTaxRatePct,
        dcfWaccPct,
        dcfTerminalGrowthPct,
        dcfExitMultiple,
      },
      smartDefaults: smartDefaultsForSeed,
      integrationCapexPct,
      integrationDaPct,
    })
    if (dcfEbitdaMarginPct !== 0 || 'dcf_ebitda_margin_pct' in seedPatch) {
      canRepairInitialZeroEbitdaMarginRef.current = false
    }
    for (const [field, value] of Object.entries(seedPatch)) {
      onFieldChange(field, value)
    }
  }, [
    variant,
    dcfInputMode,
    terminalValueMethod,
    disabled,
    // Smart-defaults change when historical data updates — re-seed missing fields.
    smartDefaultsForSeed,
    integrationCapexPct,
    integrationDaPct,
    dcfCapexPct,
    dcfDaPct,
    dcfEbitdaMarginPct,
    dcfExitMultiple,
    dcfNwcPct,
    dcfRevenueGrowthPct,
    dcfTaxRatePct,
    dcfTerminalGrowthPct,
    dcfWaccPct,
    onFieldChange,
  ])

  const segmentOptions = TERMINAL_METHOD_VALUES.map((value) => ({
    value,
    label: t(`terminalMethod.${value}` as const),
  }))
  const terminalSegmentOptions =
    dcfInputMode === 'fcff_only'
      ? segmentOptions.filter((o) => o.value === 'perpetual_growth')
      : segmentOptions
  const discountingConventionOptions = DCF_DISCOUNTING_CONVENTION_VALUES.map((value) => ({
    value,
    label: t(`dcfDiscountingConvention.${value}` as const),
  }))
  const onPerpetualTerminal =
    dcfInputMode === 'fcff_only' || terminalValueMethod === 'perpetual_growth'
  const terminalGrowthSpreadInvalid =
    onPerpetualTerminal &&
    dcfWaccPct != null &&
    Number.isFinite(dcfWaccPct) &&
    dcfTerminalGrowthPct != null &&
    Number.isFinite(dcfTerminalGrowthPct) &&
    !isDcfPerpetualSpreadValid(dcfWaccPct, dcfTerminalGrowthPct)

  const { sectionComplete, showForecastDefaultsBlock, showDiscountTerminalBlock } = useMemo(
    () =>
      buildDcfGlobalAssumptionsSectionState({
        variant,
        dcfInputMode,
        terminalValueMethod,
        dcfRevenueGrowthPct,
        dcfEbitdaMarginPct,
        dcfWaccPct,
        dcfTerminalGrowthPct,
        dcfExitMultiple,
      }),
    [
      variant,
      dcfInputMode,
      terminalValueMethod,
      dcfRevenueGrowthPct,
      dcfEbitdaMarginPct,
      dcfWaccPct,
      dcfTerminalGrowthPct,
      dcfExitMultiple,
    ]
  )

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

      {showForecastDefaultsBlock && (
        <DcfForecastDefaultsBlock
          variant={variant}
          dcfInputMode={dcfInputMode}
          dcfRevenueGrowthPct={dcfRevenueGrowthPct}
          dcfEbitdaMarginPct={dcfEbitdaMarginPct}
          dcfCapexPct={dcfCapexPct}
          dcfDaPct={dcfDaPct}
          dcfNwcPct={dcfNwcPct}
          dcfTaxRatePct={dcfTaxRatePct}
          dcfDefaultsProvenance={dcfDefaultsProvenance}
          smartDefaultsPresent={smartDefaults != null}
          showDcfInputModeToggle={showDcfInputModeToggle && variant === 'forecastDefaultsOnly'}
          dcfModeSegmentOptions={dcfModeSegmentOptions}
          onDcfInputModeChange={onDcfInputModeChange}
          onFieldChange={onFieldChange}
          onApplyToForecastYears={onApplyToForecastYears}
          canApplyToForecastYears={canApplyToForecastYears}
          forecastYearCount={forecastYearCount}
          disabled={disabled}
        />
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
            <div className="grid grid-cols-1 gap-3">
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
                sectorBand={waccSectorBand}
              />
              <AcademicValidationNotice />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {t('globalAssumptionGroups.terminalValue')}
            </h4>
            <div className="space-y-1.5 rounded-xl border border-primary/10 bg-primary/[0.03] p-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
                {t('dcfDiscountingConventionLabel')}
              </span>
              <SegmentedControl
                options={discountingConventionOptions}
                value={dcfDiscountingConvention}
                onChange={(value) => onDiscountingConventionChange?.(value)}
                size="sm"
                fullWidth
                disabled={disabled}
                aria-label={t('dcfDiscountingConventionAriaLabel')}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {dcfDiscountingConvention === 'year_end'
                  ? t('dcfDiscountingConvention.yearEndHint')
                  : t('dcfDiscountingConvention.midYearHint')}
              </p>
            </div>
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
                  className="grid grid-cols-1 gap-3"
                >
                  <div className="space-y-1">
                    <AdaptivePercentInput
                      label={t('fields.dcfTerminalGrowthPct')}
                      value={dcfTerminalGrowthPct}
                      onChange={(v) => {
                        onFieldChange('dcf_terminal_growth_pct', v)
                        // If the user lowers below the 5% cap, drop the ack so the
                        // hard-stop re-fires next time they push past 5% again.
                        if (typeof v === 'number' && v <= 5) setTerminalGrowthCapAck(false)
                      }}
                      placeholder={String(DCF_DEFAULT_TERMINAL_GROWTH_PCT)}
                      disabled={disabled}
                      truncateLabel={false}
                    />
                    {dcfTerminalGrowthPct != null &&
                      Number.isFinite(dcfTerminalGrowthPct) &&
                      dcfTerminalGrowthPct > 3 &&
                      !terminalGrowthSpreadInvalid &&
                      dcfTerminalGrowthPct <= 5 && (
                        <p
                          className="text-[10px] leading-snug text-amber-800 dark:text-amber-200/90"
                          role="note"
                        >
                          {t('terminalGrowthHighWarning')}
                        </p>
                      )}
                    {terminalGrowthSpreadInvalid && (
                      <p
                        className="text-[10px] leading-snug text-red-700 dark:text-red-300"
                        role="alert"
                      >
                        {t('terminalGrowthWaccSpreadWarning', {
                          wacc:
                            dcfWaccPct != null && Number.isFinite(dcfWaccPct)
                              ? dcfWaccPct.toFixed(1)
                              : '',
                        })}
                      </p>
                    )}
                    {dcfTerminalGrowthPct != null &&
                      Number.isFinite(dcfTerminalGrowthPct) &&
                      dcfTerminalGrowthPct > 5 &&
                      !terminalGrowthCapAck && (
                        <div
                          className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-3"
                          role="alertdialog"
                          aria-labelledby="terminal-growth-cap-title"
                        >
                          <p
                            id="terminal-growth-cap-title"
                            className="text-[11px] font-semibold text-amber-900 dark:text-amber-200"
                          >
                            {t('terminalGrowthCapTitle')}
                          </p>
                          <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200/85">
                            {t('terminalGrowthCapBody')}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setTerminalGrowthCapAck(true)}
                              disabled={disabled}
                              className="inline-flex items-center justify-center rounded-md border border-amber-600/40 bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t('terminalGrowthCapAck')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onFieldChange('dcf_terminal_growth_pct', 3)
                                setTerminalGrowthCapAck(false)
                              }}
                              disabled={disabled}
                              className="inline-flex items-center justify-center rounded-md border border-foreground/15 bg-background px-2.5 py-1.5 text-[10px] font-medium text-foreground/75 hover:border-foreground/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t('terminalGrowthCapClear')}
                            </button>
                          </div>
                        </div>
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
                  className="grid grid-cols-1 gap-3"
                >
                  <AdaptivePercentInput
                    label={t('fields.dcfExitMultiple')}
                    value={dcfExitMultiple}
                    onChange={(v) => onFieldChange('dcf_exit_multiple', v)}
                    placeholder="6.0"
                    disabled={disabled}
                    step="0.1"
                    truncateLabel={false}
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
