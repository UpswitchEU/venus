'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
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
  dcfNwcPct?: number
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
  dcfNwcPct,
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
  disabled,
  className,
}: DcfGlobalAssumptionsProps) {
  const t = useTranslations('manualInput.methodSelector')

  const segmentOptions = terminalMethodOptions.map((opt) => ({
    ...opt,
    label: t(`terminalMethod.${opt.value}` as const),
  }))

  const globalAssumptionsComplete = useMemo(() => {
    const waccOk = dcfWaccPct != null && Number.isFinite(dcfWaccPct) && dcfWaccPct > 0
    const terminalOk =
      terminalValueMethod === 'perpetual_growth'
        ? dcfTerminalGrowthPct != null && Number.isFinite(dcfTerminalGrowthPct)
        : dcfExitMultiple != null && Number.isFinite(dcfExitMultiple) && dcfExitMultiple > 0
    return waccOk && terminalOk
  }, [dcfWaccPct, terminalValueMethod, dcfTerminalGrowthPct, dcfExitMultiple])

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

      {/* Forecast autofill: revenue growth + EBITDA margin */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {t('globalAssumptionGroups.forecastDefaults')}
        </h4>
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
          <AdaptivePercentInput
            label={t('fields.dcfCapexPct')}
            value={dcfCapexPct}
            onChange={(v) => onFieldChange('dcf_capex_pct', v)}
            placeholder="3"
            disabled={disabled}
          />
          <AdaptivePercentInput
            label={t('fields.dcfNwcPct')}
            value={dcfNwcPct}
            onChange={(v) => onFieldChange('dcf_nwc_pct', v)}
            placeholder="2"
            disabled={disabled}
          />
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
      </div>

      {/* Discount rate */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {t('globalAssumptionGroups.discountRate')}
        </h4>
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
        <SegmentedControl
          options={segmentOptions}
          value={terminalValueMethod}
          onChange={onTerminalValueMethodChange}
          size="sm"
          aria-label={t('terminalMethodAriaLabel')}
        />
        <AnimatePresence mode="wait" initial={false}>
          {terminalValueMethod === 'perpetual_growth' && (
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
          {terminalValueMethod === 'exit_multiple' && (
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
