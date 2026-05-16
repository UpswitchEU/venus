'use client'

import { useTranslations } from 'next-intl'
import type React from 'react'
import { lazy, Suspense } from 'react'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  appendManualForecastYear,
  canAppendForecastYear,
  getNextForecastYear,
} from '../../../utils/forecastYears'
import type { ManualInputFieldValidation } from '../utils/manualInputFieldValidation'
import type { UpdateManualYearlyFinancials } from '../utils/manualYearlyFinancialUpdates'
import { DcfForecastWorkspace, type DcfInputMode } from './DcfForecastWorkspace'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import type { DcfProjectionPreviewRow } from './dcfProjectionPreview'
import type { DcfSmartDefaults, WaccSectorBand } from './dcfSmartDefaults'

const DcfGlobalAssumptions = lazy(() =>
  import('./DcfGlobalAssumptions').then((module) => ({
    default: module.DcfGlobalAssumptions,
  }))
)

function BonusSectionFallback() {
  return <div className="my-2 h-16 animate-pulse rounded-lg bg-foreground/[0.04]" aria-hidden />
}

interface EmbeddedDcfControlsProps {
  adaptiveDcfGlobalStep?: number
  dcfDefaultsProvenance: 'none' | 'integration' | 'history' | 'both'
  dcfForecastDefaultsStep: number
  dcfForecastRows: YearlyFinancials[]
  dcfForecastWorkspaceStep: number
  dcfModeSegmentOptions: Array<{ label: string; value: DcfInputMode }>
  dcfProjectionAutofillRows: DcfProjectionPreviewRow[]
  dcfSmartDefaultsFromHistory: DcfSmartDefaults | null
  dcfWaccTerminalStep: number
  fieldValidation: ManualInputFieldValidation
  formData: ManualValuationFormData
  handleDcfInputModeChange: (mode: DcfInputMode) => void
  handleTerminalValueMethodChange: (method: TerminalValueMethod) => void
  hasDcfSelected: boolean
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
  isCalculating: boolean
  latestHistoricalEbitda?: number
  latestHistoricalRevenue?: number
  setFormData: React.Dispatch<React.SetStateAction<ManualValuationFormData>>
  setShowForecastRemovalConfirm: (open: boolean) => void
  terminalValueMethod: TerminalValueMethod
  updateYearlyFinancials: UpdateManualYearlyFinancials
  waccSectorBand: WaccSectorBand | null
}

export function EmbeddedDcfControls({
  adaptiveDcfGlobalStep,
  dcfDefaultsProvenance,
  dcfForecastDefaultsStep,
  dcfForecastRows,
  dcfForecastWorkspaceStep,
  dcfModeSegmentOptions,
  dcfProjectionAutofillRows,
  dcfSmartDefaultsFromHistory,
  dcfWaccTerminalStep,
  fieldValidation,
  formData,
  handleDcfInputModeChange,
  handleTerminalValueMethodChange,
  hasDcfSelected,
  integrationDerivedCapexPct,
  integrationDerivedDaPct,
  isCalculating,
  latestHistoricalEbitda,
  latestHistoricalRevenue,
  setFormData,
  setShowForecastRemovalConfirm,
  terminalValueMethod,
  updateYearlyFinancials,
  waccSectorBand,
}: EmbeddedDcfControlsProps) {
  const mi = useTranslations('manualInput')

  if (!(hasDcfSelected && dcfForecastRows.length > 0)) return null

  const showGlobalAssumptions = adaptiveDcfGlobalStep != null
  const dcfInputMode = formData.dcf_input_mode ?? 'ebitda'

  return (
    <>
      {showGlobalAssumptions && (
        <Suspense fallback={<BonusSectionFallback />}>
          <DcfGlobalAssumptions
            key="dcf_forecast_defaults_embedded"
            variant="forecastDefaultsOnly"
            className="mt-6 rounded-xl border border-primary/10 bg-primary/[0.03] p-4 sm:p-5"
            step={dcfForecastDefaultsStep}
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
            terminalValueMethod={terminalValueMethod}
            onTerminalValueMethodChange={handleTerminalValueMethodChange}
            onFieldChange={(field, value) => {
              setFormData((prev) => ({ ...prev, [field]: value }))
            }}
            dcfInputMode={dcfInputMode}
            showDcfInputModeToggle
            dcfModeSegmentOptions={dcfModeSegmentOptions}
            onDcfInputModeChange={handleDcfInputModeChange}
            disabled={isCalculating}
            dcfDefaultsProvenance={dcfDefaultsProvenance}
            smartDefaults={dcfSmartDefaultsFromHistory}
            integrationCapexPct={integrationDerivedCapexPct}
            integrationDaPct={integrationDerivedDaPct}
            waccSectorBand={waccSectorBand}
          />
        </Suspense>
      )}

      <DcfForecastWorkspace
        step={dcfForecastWorkspaceStep}
        showModeToggle={false}
        forecastRows={dcfForecastRows}
        derivedProjectionPreview={dcfProjectionAutofillRows}
        latestHistoricalRevenue={latestHistoricalRevenue}
        latestHistoricalEbitda={latestHistoricalEbitda}
        fieldValidation={fieldValidation}
        globalCapexPct={formData.dcf_capex_pct}
        globalDaPct={formData.dcf_da_pct}
        globalNwcPct={formData.dcf_nwc_pct}
        globalTaxRatePct={formData.dcf_tax_rate_pct}
        disabled={isCalculating}
        canAddYear={canAppendForecastYear(formData.yearlyFinancials)}
        nextForecastYear={getNextForecastYear(formData.yearlyFinancials)}
        dcfInputMode={dcfInputMode}
        onDcfInputModeChange={handleDcfInputModeChange}
        onChange={(year, field, value) => updateYearlyFinancials(year, true, field, value)}
        onAddYear={() => {
          setFormData((prev) => {
            const result = appendManualForecastYear(prev.yearlyFinancials)
            if (!result.ok) {
              if (result.reason === 'year_out_of_range') {
                import('sonner').then(({ toast }) =>
                  toast.error(mi('forecastYearOutOfRange') || 'Forecast year out of range')
                )
              }
              return prev
            }
            return {
              ...prev,
              yearlyFinancials: result.yearlyFinancials as YearlyFinancials[],
            }
          })
        }}
        onRequestRemoveForecastYears={() => setShowForecastRemovalConfirm(true)}
      />

      {showGlobalAssumptions && (
        <Suspense fallback={<BonusSectionFallback />}>
          <DcfGlobalAssumptions
            key="dcf_discount_terminal_embedded"
            variant="discountTerminalOnly"
            className="mt-4"
            step={dcfWaccTerminalStep}
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
            terminalValueMethod={terminalValueMethod}
            onTerminalValueMethodChange={handleTerminalValueMethodChange}
            onFieldChange={(field, value) => {
              setFormData((prev) => ({ ...prev, [field]: value }))
            }}
            dcfInputMode={dcfInputMode}
            disabled={isCalculating}
            smartDefaults={dcfSmartDefaultsFromHistory}
            integrationCapexPct={integrationDerivedCapexPct}
            integrationDaPct={integrationDerivedDaPct}
            waccSectorBand={waccSectorBand}
          />
        </Suspense>
      )}
    </>
  )
}
