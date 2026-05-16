import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LiquidationInputsSectionProps } from '@/components/calculator/sections/LiquidationInputsSection'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import {
  deriveLiquidationDeferredTaxPrefillSource,
  deriveLiquidationPaidUpCapitalPrefillSource,
  LiquidationSectionStack,
} from './LiquidationSectionStack'

const mocks = vi.hoisted(() => ({
  sectionProps: [] as LiquidationInputsSectionProps[],
}))

vi.mock('@/components/calculator/sections/LiquidationInputsSection', () => ({
  LiquidationInputsSection: (props: LiquidationInputsSectionProps) => {
    mocks.sectionProps.push(props)
    return <div>liquidation-section:{props.step}</div>
  },
}))

const latestCompleteYearlyFinancial: YearlyFinancials = {
  year: '2024',
  revenue: 1_000_000,
  ebitda: 150_000,
  rent_expense: 120_000,
  total_equity: 300_000,
  paid_up_capital: 90_000,
  deferred_tax_liabilities: 40_000,
}

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'industrial',
    industry: 'manufacturing',
    country: 'BE',
    yearFounded: '2010',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    liq_headcount: 12,
    liq_monthly_rent: 10_000,
    liq_paid_up_capital: 90_000,
    liq_deferred_tax: 40_000,
    liq_premise_override: 'orderly_liquidation',
    liq_realised_capital_gains: 15_000,
    liq_taxable_reserves: 25_000,
    liq_runway_months_orderly: 9,
    liq_runway_months_forced: 3,
    liq_distress_wacc_orderly: 0.12,
    liq_distress_wacc_forced: 0.2,
    liq_intangibles_uplift_pct: 0.1,
    liq_multiples_value_override: 500_000,
    liq_lb_secured: 100_000,
    liq_lb_unsecured: 55_000,
    liq_ao_cash: 20_000,
    liq_ao_machinery_equipment: 75_000,
    ...partial,
  }
}

describe('LiquidationSectionStack', () => {
  it('renders liquidation as the NAV sibling step and maps form fields to section props', () => {
    const onFieldChange = vi.fn()
    const onAnyFieldChange = vi.fn()

    render(
      <LiquidationSectionStack
        navStep={6}
        navSectionActive
        formData={formData({ number_of_employees: 14 } as Partial<ManualValuationFormData>)}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={onFieldChange}
        onAnyFieldChange={onAnyFieldChange}
      />
    )

    expect(screen.getByText('liquidation-section:6e')).toBeInTheDocument()
    expect(mocks.sectionProps.at(-1)).toMatchObject({
      step: '6e',
      liqHeadcount: 12,
      liqMonthlyRent: 10_000,
      liqPaidUpCapital: 90_000,
      liqDeferredTax: 40_000,
      liqPremiseOverride: 'orderly_liquidation',
      liqRealisedCapitalGains: 15_000,
      liqTaxableReserves: 25_000,
      liqRunwayMonthsOrderly: 9,
      liqRunwayMonthsForced: 3,
      liqDistressWaccOrderly: 0.12,
      liqDistressWaccForced: 0.2,
      liqIntangiblesUpliftPct: 0.1,
      liqMultiplesValueOverride: 500_000,
      liqLiabilityBuckets: {
        secured: 100_000,
        unsecured: 55_000,
      },
      liqAssetOverrides: {
        cash: 20_000,
        machinery_equipment: 75_000,
      },
      prefillSourceHeadcount: 14,
      prefillSourceAnnualRent: 120_000,
      prefillSourcePaidUpCapital: 90_000,
      prefillSourceDeferredTax: 40_000,
      onFieldChange,
      onAnyFieldChange,
    })
  })

  it('falls back to a numeric NAV step when the NAV sibling is absent', () => {
    render(
      <LiquidationSectionStack
        navStep={6}
        navSectionActive={false}
        formData={formData()}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('liquidation-section:6')).toBeInTheDocument()
  })
})

describe('liquidation prefill source derivation', () => {
  it('prefers dedicated paid-up capital and falls back to total equity', () => {
    expect(
      deriveLiquidationPaidUpCapitalPrefillSource({
        ...latestCompleteYearlyFinancial,
        paid_up_capital: 120_000,
        total_equity: 300_000,
      })
    ).toBe(120_000)
    expect(
      deriveLiquidationPaidUpCapitalPrefillSource({
        ...latestCompleteYearlyFinancial,
        paid_up_capital: 0,
        total_equity: 300_000,
      })
    ).toBe(300_000)
  })

  it('does not proxy deferred-tax liabilities from other liabilities', () => {
    expect(
      deriveLiquidationDeferredTaxPrefillSource({
        ...latestCompleteYearlyFinancial,
        deferred_tax_liabilities: 0,
        total_liabilities: 900_000,
      })
    ).toBeUndefined()
  })
})
