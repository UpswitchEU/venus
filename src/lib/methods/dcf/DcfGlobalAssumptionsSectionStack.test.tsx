import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalValueMethod } from '@/components/calculator/sections/DcfGlobalAssumptions'
import type { ManualValuationFormData } from '@/types/valuation'
import { DcfGlobalAssumptionsSectionStack } from './DcfGlobalAssumptionsSectionStack'
import { shouldMountDcfGlobalAssumptionsSectionStack } from './sectionEligibility'

type MockDcfGlobalAssumptionsProps = {
  className?: string
  step: number
  variant?: 'full' | 'forecastDefaultsOnly' | 'discountTerminalOnly'
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
  dcfDiscountingConvention?: 'mid_year' | 'year_end'
  terminalValueMethod: TerminalValueMethod
  onTerminalValueMethodChange: (method: TerminalValueMethod) => void
  onDiscountingConventionChange?: (convention: 'mid_year' | 'year_end') => void
  onFieldChange: (field: string, value: number | undefined) => void
  onApplyToForecastYears?: () => void
  canApplyToForecastYears?: boolean
  forecastYearCount?: number
  dcfInputMode?: 'ebitda' | 'fcff_only'
  showDcfInputModeToggle?: boolean
  dcfModeSegmentOptions?: { value: string; label: string }[]
  onDcfInputModeChange?: (mode: 'ebitda' | 'fcff_only') => void
  disabled?: boolean
  dcfDefaultsProvenance?: 'none' | 'history' | 'integration' | 'both'
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
  integrationCapexPct?: number | null
  integrationDaPct?: number | null
  waccSectorBand?: {
    sectorLabel: string
    median: number
    min: number
    max: number
  } | null
}

const mocks = vi.hoisted(() => ({
  sectionProps: [] as MockDcfGlobalAssumptionsProps[],
}))

vi.mock('@/components/calculator/sections/DcfGlobalAssumptions', () => ({
  DcfGlobalAssumptions: (props: MockDcfGlobalAssumptionsProps) => {
    mocks.sectionProps.push(props)
    return <div>dcf-global:{props.step}</div>
  },
}))

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'services',
    industry: 'consulting',
    country: 'BE',
    yearFounded: '2015',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    ...partial,
  }
}

describe('DcfGlobalAssumptionsSectionStack', () => {
  it('maps DCF form fields, terminal callbacks, and forecast count into the section', () => {
    const onFieldChange = vi.fn()
    const onTerminalValueMethodChange = vi.fn()
    const onDiscountingConventionChange = vi.fn()
    const onApplyDcfPercentAutofill = vi.fn()

    render(
      <DcfGlobalAssumptionsSectionStack
        step={5}
        className="mt-6"
        formData={formData({
          yearlyFinancials: [
            { year: '2024', revenue: 1_000_000, ebitda: 150_000 },
            { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
            { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
          ],
          dcf_revenue_growth_pct: 8,
          dcf_ebitda_margin_pct: 20,
          dcf_capex_pct: 4,
          dcf_da_pct: 3,
          dcf_nwc_pct: 1,
          dcf_tax_rate_pct: 25,
          dcf_wacc_pct: 11,
          dcf_terminal_growth_pct: 2,
          dcf_exit_multiple: 6,
          dcf_risk_free_rate_pct: 3.5,
          dcf_equity_risk_premium_pct: 5.5,
          dcf_beta: 1.1,
          dcf_cost_of_debt_pct: 4.2,
          dcf_debt_equity_pct: 35,
          dcf_tax_shield_pct: 25,
          dcf_discounting_convention: 'year_end',
          dcf_input_mode: 'fcff_only',
        })}
        terminalValueMethod="perpetual_growth"
        onTerminalValueMethodChange={onTerminalValueMethodChange}
        onDiscountingConventionChange={onDiscountingConventionChange}
        onFieldChange={onFieldChange}
        onApplyDcfPercentAutofill={onApplyDcfPercentAutofill}
        canApplyDcfPercentAutofill
        disabled
      />
    )

    expect(mocks.sectionProps.at(-1)).toMatchObject({
      className: 'mt-6',
      step: 5,
      dcfRevenueGrowthPct: 8,
      dcfEbitdaMarginPct: 20,
      dcfCapexPct: 4,
      dcfDaPct: 3,
      dcfNwcPct: 1,
      dcfTaxRatePct: 25,
      dcfWaccPct: 11,
      dcfTerminalGrowthPct: 2,
      dcfExitMultiple: 6,
      dcfRiskFreeRatePct: 3.5,
      dcfEquityRiskPremiumPct: 5.5,
      dcfBeta: 1.1,
      dcfCostOfDebtPct: 4.2,
      dcfDebtEquityPct: 35,
      dcfTaxShieldPct: 25,
      dcfDiscountingConvention: 'year_end',
      terminalValueMethod: 'perpetual_growth',
      onTerminalValueMethodChange,
      onDiscountingConventionChange,
      onFieldChange,
      onApplyToForecastYears: onApplyDcfPercentAutofill,
      canApplyToForecastYears: true,
      forecastYearCount: 2,
      dcfInputMode: 'fcff_only',
      disabled: true,
    })
  })

  it('passes embedded DCF controls without reintroducing caller-side field mapping', () => {
    const onDcfInputModeChange = vi.fn()
    const smartDefaults = {
      revenueGrowthPct: 5,
      ebitdaMarginPct: 18,
      capexPct: 4,
      daPct: 3,
      taxRatePct: 25,
      waccPct: 10,
      terminalGrowthPct: 2,
      exitMultiple: 6,
      historicalYearsUsed: 3,
    }
    const waccSectorBand = {
      sectorLabel: 'SaaS / Software',
      median: 11,
      min: 8.5,
      max: 13.5,
    }

    render(
      <DcfGlobalAssumptionsSectionStack
        step={6}
        variant="forecastDefaultsOnly"
        formData={formData({ dcf_input_mode: 'ebitda' })}
        terminalValueMethod="perpetual_growth"
        onTerminalValueMethodChange={vi.fn()}
        onFieldChange={vi.fn()}
        showDcfInputModeToggle
        dcfModeSegmentOptions={[
          { value: 'ebitda', label: 'Via EBITDA' },
          { value: 'fcff_only', label: 'FCFF only' },
        ]}
        onDcfInputModeChange={onDcfInputModeChange}
        dcfDefaultsProvenance="both"
        smartDefaults={smartDefaults}
        integrationCapexPct={5.2}
        integrationDaPct={2.4}
        waccSectorBand={waccSectorBand}
      />
    )

    expect(mocks.sectionProps.at(-1)).toMatchObject({
      step: 6,
      variant: 'forecastDefaultsOnly',
      dcfInputMode: 'ebitda',
      showDcfInputModeToggle: true,
      dcfModeSegmentOptions: [
        { value: 'ebitda', label: 'Via EBITDA' },
        { value: 'fcff_only', label: 'FCFF only' },
      ],
      onDcfInputModeChange,
      dcfDefaultsProvenance: 'both',
      smartDefaults,
      integrationCapexPct: 5.2,
      integrationDaPct: 2.4,
      waccSectorBand,
    })
  })

  it('keeps DCF global render eligibility method-owned', () => {
    expect(
      shouldMountDcfGlobalAssumptionsSectionStack({
        bonusSections: ['dcf_projections'],
        terminalValueMethod: 'perpetual_growth',
        onTerminalValueMethodChange: vi.fn(),
        dcfGlobalStep: 5,
      })
    ).toBe(true)
    expect(
      shouldMountDcfGlobalAssumptionsSectionStack({
        bonusSections: ['dcf_projections'],
        suppressDcfGlobalAssumptions: true,
        terminalValueMethod: 'perpetual_growth',
        onTerminalValueMethodChange: vi.fn(),
        dcfGlobalStep: 5,
      })
    ).toBe(false)
  })
})
