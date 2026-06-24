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
import { coerceFiniteNumber } from '@/utils/isFiniteNumeric'

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

function numericFormValue(value: unknown): number | undefined {
  return coerceFiniteNumber(value)
}

function discountingConventionValue(
  value: ManualValuationFormData['dcf_discounting_convention']
): DcfDiscountingConvention {
  return value === 'year_end' ? 'year_end' : 'mid_year'
}

function dcfInputModeValue(value: ManualValuationFormData['dcf_input_mode']) {
  return value === 'fcff_only' ? 'fcff_only' : 'ebitda'
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
      dcfRevenueGrowthPct={numericFormValue(formData.dcf_revenue_growth_pct)}
      dcfEbitdaMarginPct={numericFormValue(formData.dcf_ebitda_margin_pct)}
      dcfCapexPct={numericFormValue(formData.dcf_capex_pct)}
      dcfDaPct={numericFormValue(formData.dcf_da_pct)}
      dcfNwcPct={numericFormValue(formData.dcf_nwc_pct)}
      dcfTaxRatePct={numericFormValue(formData.dcf_tax_rate_pct)}
      dcfWaccPct={numericFormValue(formData.dcf_wacc_pct)}
      dcfTerminalGrowthPct={numericFormValue(formData.dcf_terminal_growth_pct)}
      dcfExitMultiple={numericFormValue(formData.dcf_exit_multiple)}
      dcfRiskFreeRatePct={numericFormValue(formData.dcf_risk_free_rate_pct)}
      dcfEquityRiskPremiumPct={numericFormValue(formData.dcf_equity_risk_premium_pct)}
      dcfBeta={numericFormValue(formData.dcf_beta)}
      dcfCostOfDebtPct={numericFormValue(formData.dcf_cost_of_debt_pct)}
      dcfDebtEquityPct={numericFormValue(formData.dcf_debt_equity_pct)}
      dcfTaxShieldPct={numericFormValue(formData.dcf_tax_shield_pct)}
      dcfDiscountingConvention={discountingConventionValue(formData.dcf_discounting_convention)}
      terminalValueMethod={terminalValueMethod}
      onTerminalValueMethodChange={onTerminalValueMethodChange}
      onDiscountingConventionChange={onDiscountingConventionChange}
      onFieldChange={onFieldChange}
      onApplyToForecastYears={onApplyDcfPercentAutofill}
      canApplyToForecastYears={!!canApplyDcfPercentAutofill}
      forecastYearCount={countForecastYears(formData.yearlyFinancials ?? [])}
      dcfInputMode={dcfInputModeValue(formData.dcf_input_mode)}
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
