'use client'

import {
  type DcfDiscountingConvention,
  DcfGlobalAssumptions,
  type DcfGlobalAssumptionsVariant,
  type TerminalValueMethod,
} from '@/components/calculator/sections/DcfGlobalAssumptions'
import type {
  DcfSmartDefaults,
  WaccSectorBand,
} from '@/components/calculator/sections/dcfSmartDefaults'
import type { ManualValuationFormData } from '@/types/valuation'
import { countForecastYears } from '@/utils/forecastYears'

export type { TerminalValueMethod } from '@/components/calculator/sections/DcfGlobalAssumptions'

export interface DcfGlobalAssumptionsSectionStackProps {
  step: number
  variant?: DcfGlobalAssumptionsVariant
  formData: ManualValuationFormData
  terminalValueMethod: TerminalValueMethod
  onTerminalValueMethodChange: (method: TerminalValueMethod) => void
  onDiscountingConventionChange?: (convention: DcfDiscountingConvention) => void
  onFieldChange: (field: string, value: number | undefined) => void
  onApplyDcfPercentAutofill?: () => void
  canApplyDcfPercentAutofill?: boolean
  showDcfInputModeToggle?: boolean
  dcfModeSegmentOptions?: { value: string; label: string }[]
  onDcfInputModeChange?: (mode: 'ebitda' | 'fcff_only') => void
  disabled?: boolean
  className?: string
  dcfDefaultsProvenance?: 'none' | 'history' | 'integration' | 'both'
  smartDefaults?: DcfSmartDefaults | null
  integrationCapexPct?: number | null
  integrationDaPct?: number | null
  waccSectorBand?: WaccSectorBand | null
}

export function DcfGlobalAssumptionsSectionStack({
  step,
  variant,
  formData,
  terminalValueMethod,
  onTerminalValueMethodChange,
  onDiscountingConventionChange,
  onFieldChange,
  onApplyDcfPercentAutofill,
  canApplyDcfPercentAutofill,
  showDcfInputModeToggle,
  dcfModeSegmentOptions,
  onDcfInputModeChange,
  disabled,
  className,
  dcfDefaultsProvenance,
  smartDefaults,
  integrationCapexPct,
  integrationDaPct,
  waccSectorBand,
}: DcfGlobalAssumptionsSectionStackProps) {
  return (
    <DcfGlobalAssumptions
      className={className}
      step={step}
      variant={variant}
      dcfRevenueGrowthPct={formData.dcf_revenue_growth_pct as number | undefined}
      dcfEbitdaMarginPct={formData.dcf_ebitda_margin_pct as number | undefined}
      dcfCapexPct={formData.dcf_capex_pct as number | undefined}
      dcfDaPct={formData.dcf_da_pct as number | undefined}
      dcfNwcPct={formData.dcf_nwc_pct as number | undefined}
      dcfTaxRatePct={formData.dcf_tax_rate_pct as number | undefined}
      dcfWaccPct={formData.dcf_wacc_pct as number | undefined}
      dcfTerminalGrowthPct={formData.dcf_terminal_growth_pct as number | undefined}
      dcfExitMultiple={formData.dcf_exit_multiple as number | undefined}
      dcfRiskFreeRatePct={formData.dcf_risk_free_rate_pct as number | undefined}
      dcfEquityRiskPremiumPct={formData.dcf_equity_risk_premium_pct as number | undefined}
      dcfBeta={formData.dcf_beta as number | undefined}
      dcfCostOfDebtPct={formData.dcf_cost_of_debt_pct as number | undefined}
      dcfDebtEquityPct={formData.dcf_debt_equity_pct as number | undefined}
      dcfTaxShieldPct={formData.dcf_tax_shield_pct as number | undefined}
      dcfDiscountingConvention={formData.dcf_discounting_convention ?? 'mid_year'}
      terminalValueMethod={terminalValueMethod}
      onTerminalValueMethodChange={onTerminalValueMethodChange}
      onDiscountingConventionChange={onDiscountingConventionChange}
      onFieldChange={onFieldChange}
      onApplyToForecastYears={onApplyDcfPercentAutofill}
      canApplyToForecastYears={!!canApplyDcfPercentAutofill}
      forecastYearCount={countForecastYears(formData.yearlyFinancials ?? [])}
      dcfInputMode={formData.dcf_input_mode ?? 'ebitda'}
      showDcfInputModeToggle={showDcfInputModeToggle}
      dcfModeSegmentOptions={dcfModeSegmentOptions}
      onDcfInputModeChange={onDcfInputModeChange}
      disabled={disabled}
      dcfDefaultsProvenance={dcfDefaultsProvenance}
      smartDefaults={smartDefaults}
      integrationCapexPct={integrationCapexPct}
      integrationDaPct={integrationDaPct}
      waccSectorBand={waccSectorBand}
    />
  )
}
