import { describe, expect, it } from 'vitest'
import { mapPackageFormData } from '../SessionPackageFormDataMapper'

describe('SessionPackageHydrator', () => {
  it('maps and normalizes camelCase DCF package fields before store hydration', () => {
    const mapped = mapPackageFormData({
      dcfInputMode: 'unexpected',
      dcfWaccPct: '11,0',
      dcfTerminalGrowthPct: '2,25',
      dcfRevenueGrowthPct: '8,5',
      dcfEbitdaMarginPct: '20,5',
      dcfCapexPct: '4,0',
      dcfDaPct: '3,0',
      dcfNwcPct: '1,5',
      dcfTaxRatePct: '25,0',
      dcfRiskFreeRatePct: '3,0',
      dcfEquityRiskPremiumPct: '5,5',
      dcfBeta: '1,1',
      dcfCostOfDebtPct: '4,5',
      dcfDebtEquityPct: '30',
      dcfTaxShieldPct: '25',
      dcfDiscountingConvention: 'unexpected',
      dcfTaxShieldProjections: ['1.500', '1.125', null],
      dcfTerminalValueMethod: 'perpetuity_growth',
    })

    expect(mapped).toMatchObject({
      dcf_input_mode: 'ebitda',
      dcf_wacc_pct: 11,
      dcf_terminal_growth_pct: 2.25,
      dcf_revenue_growth_pct: 8.5,
      dcf_ebitda_margin_pct: 20.5,
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 1.5,
      dcf_tax_rate_pct: 25,
      dcf_risk_free_rate_pct: 3,
      dcf_equity_risk_premium_pct: 5.5,
      dcf_beta: 1.1,
      dcf_cost_of_debt_pct: 4.5,
      dcf_debt_equity_pct: 30,
      dcf_tax_shield_pct: 25,
      dcf_discounting_convention: 'mid_year',
      dcf_tax_shield_projections: [1500, 1125],
      dcf_terminal_value_method: 'perpetual_growth',
    })
    expect(mapped).not.toHaveProperty('dcfWaccPct')
    expect(mapped).not.toHaveProperty('dcfTerminalValueMethod')
  })
})
