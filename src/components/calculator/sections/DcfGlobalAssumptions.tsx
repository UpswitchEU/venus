'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Database, History } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
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
  /**
   * Historical-derived defaults (CAGR for revenue growth, latest margin, sector WACC base).
   * When supplied, the seed effect prefers these over the static engine fallbacks
   * so blank inputs ship the actually-defensible value to the engine, not "3%".
   */
  smartDefaults?: {
    revenueGrowthPct?: number
    ebitdaMarginPct?: number
    capexPct?: number
    daPct?: number
    nwcPct?: number
    taxRatePct?: number
    waccPct?: number
    terminalGrowthPct?: number
    exitMultiple?: number
  } | null
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

const TERMINAL_METHOD_VALUES: TerminalValueMethod[] = ['perpetual_growth', 'exit_multiple']

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
  smartDefaults,
  integrationCapexPct,
  integrationDaPct,
  waccSectorBand,
}: DcfGlobalAssumptionsProps) {
  const t = useTranslations('manualInput.methodSelector')
  // Collapsed by default — the four FCFF drivers (CapEx, D&A, ΔNWC, tax) are
  // shown in the summary line and are typically left on sector defaults. Keeping
  // them open by default greets the user with six percent inputs and reads as overload.
  const [showAdvancedDrivers, setShowAdvancedDrivers] = useState(false)

  // Cap-ack state for the >5% terminal-growth hard-stop. Local-only (we don't
  // persist this on the request) — re-firing the gate after a fresh entry is
  // intentional. Pattern matches `project_normalization_bridge_phase1_2026_04_29.md`.
  const [terminalGrowthCapAck, setTerminalGrowthCapAck] = useState(false)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable defaults; we want a one-shot seed per missing field
  useEffect(() => {
    if (disabled) return
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
    const pick = (...sources: Array<number | null | undefined>): number | undefined => {
      for (const s of sources) {
        if (finite(s)) return s
      }
      return undefined
    }
    const seedIfMissing = (
      current: number | undefined,
      field: string,
      value: number | undefined
    ) => {
      if (finite(current)) return
      if (value === undefined) return
      onFieldChange(field, value)
    }
    const inForecastBlock = variant === 'full' || variant === 'forecastDefaultsOnly'
    const inDiscountBlock = variant === 'full' || variant === 'discountTerminalOnly'

    // Forecast defaults — only seeded in EBITDA mode (FCFF-only mode reads FCFF directly).
    if (inForecastBlock && dcfInputMode === 'ebitda') {
      seedIfMissing(
        dcfRevenueGrowthPct,
        'dcf_revenue_growth_pct',
        pick(smartDefaults?.revenueGrowthPct, DCF_DEFAULT_REVENUE_GROWTH_PCT)
      )
      seedIfMissing(
        dcfEbitdaMarginPct,
        'dcf_ebitda_margin_pct',
        pick(smartDefaults?.ebitdaMarginPct, DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT)
      )
      seedIfMissing(
        dcfCapexPct,
        'dcf_capex_pct',
        pick(integrationCapexPct, smartDefaults?.capexPct, DCF_DEFAULT_CAPEX_PCT)
      )
      seedIfMissing(
        dcfDaPct,
        'dcf_da_pct',
        pick(integrationDaPct, smartDefaults?.daPct, DCF_DEFAULT_DA_PCT)
      )
      seedIfMissing(dcfNwcPct, 'dcf_nwc_pct', pick(smartDefaults?.nwcPct, DCF_DEFAULT_NWC_PCT))
      seedIfMissing(
        dcfTaxRatePct,
        'dcf_tax_rate_pct',
        pick(smartDefaults?.taxRatePct, DCF_DEFAULT_TAX_RATE_PCT)
      )
    }

    // Discount + terminal — seed for both modes (FCFF-only still needs WACC + g).
    if (inDiscountBlock) {
      // WACC: prefer history-derived (sector-classified) over static 10%.
      // The build-up panel computes its own value when expanded; that path
      // takes over via WaccBreakdownPanel.useEffect (see WaccBreakdownPanel.tsx).
      seedIfMissing(dcfWaccPct, 'dcf_wacc_pct', pick(smartDefaults?.waccPct, 10))
      const onPerpetual = dcfInputMode === 'fcff_only' || terminalValueMethod === 'perpetual_growth'
      if (onPerpetual) {
        seedIfMissing(
          dcfTerminalGrowthPct,
          'dcf_terminal_growth_pct',
          pick(smartDefaults?.terminalGrowthPct, DCF_DEFAULT_TERMINAL_GROWTH_PCT)
        )
      } else {
        seedIfMissing(dcfExitMultiple, 'dcf_exit_multiple', pick(smartDefaults?.exitMultiple, 6))
      }
    }
  }, [
    variant,
    dcfInputMode,
    terminalValueMethod,
    disabled,
    // Smart-defaults change when historical data updates — re-seed missing fields.
    smartDefaults?.revenueGrowthPct,
    smartDefaults?.ebitdaMarginPct,
    smartDefaults?.capexPct,
    smartDefaults?.daPct,
    smartDefaults?.nwcPct,
    smartDefaults?.taxRatePct,
    smartDefaults?.waccPct,
    smartDefaults?.terminalGrowthPct,
    smartDefaults?.exitMultiple,
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

      {variant === 'forecastDefaultsOnly' && dcfInputMode === 'ebitda' && (
        <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
          {t('forecastDefaultsLead')}
        </p>
      )}

      {/* No-history affordance: when smartDefaults is null, we're shipping
          sector-only fallbacks. Surface that explicitly so the user knows the
          calibration is loose and can act (add historical years above).
          Only render in EBITDA-mode forecast block — FCFF-only doesn't use these. */}
      {variant === 'forecastDefaultsOnly' && dcfInputMode === 'ebitda' && smartDefaults == null && (
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

      {showDcfInputModeToggle &&
        variant === 'forecastDefaultsOnly' &&
        dcfModeSegmentOptions &&
        onDcfInputModeChange && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/55">
              {t('dcfInputModeLabelEmbedded')}
            </span>
            <SegmentedControl
              value={dcfInputMode}
              onChange={(v) => onDcfInputModeChange(v as 'ebitda' | 'fcff_only')}
              options={dcfModeSegmentOptions}
              disabled={disabled}
              size="sm"
              fullWidth
              aria-label={t('dcfInputModeLabelEmbedded')}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {dcfInputMode === 'fcff_only'
                ? t('dcfInputMode.fcffOnlyHint')
                : t('dcfInputMode.ebitdaHint')}
            </p>
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
              <div className="grid grid-cols-1 gap-3">
                <AdaptivePercentInput
                  label={t('fields.dcfRevenueGrowthPct')}
                  value={dcfRevenueGrowthPct}
                  onChange={(v) => onFieldChange('dcf_revenue_growth_pct', v)}
                  placeholder={String(DCF_DEFAULT_REVENUE_GROWTH_PCT)}
                  disabled={disabled}
                  truncateLabel={false}
                />
                <AdaptivePercentInput
                  label={t('fields.dcfEbitdaMarginPct')}
                  value={dcfEbitdaMarginPct}
                  onChange={(v) => onFieldChange('dcf_ebitda_margin_pct', v)}
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
                        onChange={(v) => onFieldChange('dcf_capex_pct', v)}
                        placeholder={String(DCF_DEFAULT_CAPEX_PCT)}
                        disabled={disabled}
                        truncateLabel={false}
                      />
                      <AdaptivePercentInput
                        label={t('fields.dcfDaPct')}
                        value={dcfDaPct}
                        onChange={(v) => onFieldChange('dcf_da_pct', v)}
                        placeholder={String(DCF_DEFAULT_DA_PCT)}
                        disabled={disabled}
                        truncateLabel={false}
                      />
                      <AdaptivePercentInput
                        label={t('fields.dcfNwcPct')}
                        description={t('fieldHints.dcfNwcPct')}
                        value={dcfNwcPct}
                        onChange={(v) => onFieldChange('dcf_nwc_pct', v)}
                        placeholder={String(DCF_DEFAULT_NWC_PCT)}
                        disabled={disabled}
                        truncateLabel={false}
                      />
                      <AdaptivePercentInput
                        label={t('fields.dcfTaxRatePct')}
                        value={dcfTaxRatePct}
                        onChange={(v) => onFieldChange('dcf_tax_rate_pct', v)}
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
                      dcfTerminalGrowthPct <= 5 && (
                        <p
                          className="text-[10px] leading-snug text-amber-800 dark:text-amber-200/90"
                          role="note"
                        >
                          {t('terminalGrowthHighWarning')}
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
