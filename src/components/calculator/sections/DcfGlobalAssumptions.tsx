'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { cn } from '@/design-system/utils'
import { AdaptivePercentInput } from './AdaptivePercentInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'
import { WaccBreakdownPanel } from './WaccBreakdownPanel'

export type TerminalValueMethod = 'perpetual_growth' | 'exit_multiple'

interface DcfGlobalAssumptionsProps {
  step: number
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
  disabled?: boolean
  className?: string
}

const terminalMethodOptions: { value: TerminalValueMethod; label: string }[] = [
  { value: 'perpetual_growth', label: '' },
  { value: 'exit_multiple', label: '' },
]

export function DcfGlobalAssumptions({
  step,
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
  disabled,
  className,
}: DcfGlobalAssumptionsProps) {
  const t = useTranslations('manualInput.methodSelector')
  const [showAdvancedDrivers, setShowAdvancedDrivers] = useState(
    () =>
      dcfCapexPct != null || dcfDaPct != null || dcfNwcPct != null || dcfTaxRatePct != null
  )

  const segmentOptions = terminalMethodOptions.map((opt) => ({
    ...opt,
    label: t(`terminalMethod.${opt.value}` as const),
  }))
  const terminalSegmentOptions =
    dcfInputMode === 'fcff_only'
      ? segmentOptions.filter((o) => o.value === 'perpetual_growth')
      : segmentOptions

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
  const advancedDriverSummary = useMemo(
    () =>
      t('advancedDriversSummary', {
        capex: (dcfCapexPct ?? 3).toFixed(1),
        da: (dcfDaPct ?? 3).toFixed(1),
        nwc: (dcfNwcPct ?? 1.5).toFixed(1),
        tax: (dcfTaxRatePct ?? 25).toFixed(1),
      }),
    [t, dcfCapexPct, dcfDaPct, dcfNwcPct, dcfTaxRatePct]
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('space-y-5 pt-2', className)}
      aria-label={t('sections.dcfGlobalAssumptions')}
    >
      <ValuationSectionHeader
        complete={globalAssumptionsComplete}
        step={step}
        title={t('sections.dcfGlobalAssumptions')}
      />

      {/* Forecast defaults: growth, margin, and FCFF bridge drivers (applied with “Apply to forecast years”) */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {t('globalAssumptionGroups.forecastDefaults')}
        </h4>
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
                placeholder="5"
                disabled={disabled}
              />
              <AdaptivePercentInput
                label={t('fields.dcfEbitdaMarginPct')}
                value={dcfEbitdaMarginPct}
                onChange={(v) => onFieldChange('dcf_ebitda_margin_pct', v)}
                placeholder="15"
                disabled={disabled}
              />
            </div>
            <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground/80">
                    {t('advancedDriversTitle')}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {advancedDriverSummary}
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('advancedDriversHelp')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedDrivers((v) => !v)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1 self-start rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/35 hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-primary/40 disabled:hover:bg-background"
                >
                  <span>
                    {showAdvancedDrivers
                      ? t('hideAdvancedDrivers')
                      : t('showAdvancedDrivers')}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      showAdvancedDrivers && 'rotate-180'
                    )}
                  />
                </button>
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
                      placeholder="3"
                      disabled={disabled}
                    />
                    <AdaptivePercentInput
                      label={t('fields.dcfDaPct')}
                      value={dcfDaPct}
                      onChange={(v) => onFieldChange('dcf_da_pct', v)}
                      placeholder="3"
                      disabled={disabled}
                    />
                    <AdaptivePercentInput
                      label={t('fields.dcfNwcPct')}
                      description={t('fieldHints.dcfNwcPct')}
                      value={dcfNwcPct}
                      onChange={(v) => onFieldChange('dcf_nwc_pct', v)}
                      placeholder="2"
                      disabled={disabled}
                    />
                    <AdaptivePercentInput
                      label={t('fields.dcfTaxRatePct')}
                      value={dcfTaxRatePct}
                      onChange={(v) => onFieldChange('dcf_tax_rate_pct', v)}
                      placeholder="25"
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

      {/* Discount rate */}
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

      {/* Terminal value */}
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
              <AdaptivePercentInput
                label={t('fields.dcfTerminalGrowthPct')}
                value={dcfTerminalGrowthPct}
                onChange={(v) => onFieldChange('dcf_terminal_growth_pct', v)}
                placeholder="2"
                disabled={disabled}
              />
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
    </motion.section>
  )
}
