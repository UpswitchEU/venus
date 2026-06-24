import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '../../../types/valuation'
import { buildManualDcfDefaultsPatch } from './manualDcfDefaultSeeding'

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    businessType: 'software',
    industry: 'technology',
    yearlyFinancials: [],
    ...overrides,
  } as ManualValuationFormData
}

describe('manual DCF default seeding', () => {
  it('seeds blank DCF globals with smart history defaults and integration bridge precedence', () => {
    const patch = buildManualDcfDefaultsPatch({
      formData: makeForm(),
      hasForecastRows: true,
      latestHistoricalRevenue: 1_000_000,
      latestHistoricalEbitda: 200_000,
      smartDefaults: {
        revenueGrowthPct: 8,
        ebitdaMarginPct: 22,
        capexPct: 5,
        daPct: 4,
        nwcPct: 2,
        taxRatePct: 24,
        waccPct: 12,
        terminalGrowthPct: 2.5,
      },
      integrationDerivedCapexPct: 6.5,
      integrationDerivedDaPct: 3.5,
    })

    expect(patch).toMatchObject({
      dcf_wacc_pct: 12,
      dcf_terminal_growth_pct: 2.5,
      dcf_revenue_growth_pct: 8,
      dcf_ebitda_margin_pct: 22,
      dcf_capex_pct: 6.5,
      dcf_da_pct: 3.5,
      dcf_nwc_pct: 1.5,
      dcf_tax_rate_pct: 24,
    })
  })

  it('derives EBITDA margin from latest historical metrics when smart defaults are absent', () => {
    const patch = buildManualDcfDefaultsPatch({
      formData: makeForm(),
      hasForecastRows: true,
      latestHistoricalRevenue: 2_000_000,
      latestHistoricalEbitda: 350_000,
      smartDefaults: null,
      integrationDerivedCapexPct: null,
      integrationDerivedDaPct: null,
    })

    expect(patch.dcf_ebitda_margin_pct).toBe(17.5)
  })

  it('does not seed forecast assumptions in FCFF-only mode', () => {
    const patch = buildManualDcfDefaultsPatch({
      formData: makeForm({ dcf_input_mode: 'fcff_only' }),
      hasForecastRows: true,
      latestHistoricalRevenue: 1_000_000,
      latestHistoricalEbitda: 200_000,
      smartDefaults: null,
      integrationDerivedCapexPct: null,
      integrationDerivedDaPct: null,
    })

    expect(patch.dcf_wacc_pct).toEqual(expect.any(Number))
    expect(patch.dcf_terminal_growth_pct).toEqual(expect.any(Number))
    expect(patch.dcf_revenue_growth_pct).toBeUndefined()
    expect(patch.dcf_ebitda_margin_pct).toBeUndefined()
    expect(patch.dcf_capex_pct).toBeUndefined()
  })

  it('preserves already-entered DCF defaults', () => {
    const patch = buildManualDcfDefaultsPatch({
      formData: makeForm({
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 2,
        dcf_revenue_growth_pct: 4,
        dcf_ebitda_margin_pct: 18,
        dcf_capex_pct: 3,
        dcf_da_pct: 2,
        dcf_nwc_pct: 0.5,
        dcf_tax_rate_pct: 20,
      }),
      hasForecastRows: true,
      latestHistoricalRevenue: 1_000_000,
      latestHistoricalEbitda: 200_000,
      smartDefaults: null,
      integrationDerivedCapexPct: 7,
      integrationDerivedDaPct: 4,
    })

    expect(patch).toEqual({})
  })

  it('normalizes restored numeric-string DCF defaults instead of overwriting them', () => {
    const patch = buildManualDcfDefaultsPatch({
      formData: makeForm({
        dcf_wacc_pct: '9,5' as unknown as number,
        dcf_terminal_growth_pct: '2,25' as unknown as number,
        dcf_revenue_growth_pct: '4,5' as unknown as number,
        dcf_ebitda_margin_pct: '18,5' as unknown as number,
        dcf_capex_pct: '3,5' as unknown as number,
        dcf_da_pct: '2,5' as unknown as number,
        dcf_nwc_pct: '0,75' as unknown as number,
        dcf_tax_rate_pct: '20,5' as unknown as number,
      }),
      hasForecastRows: true,
      latestHistoricalRevenue: 1_000_000,
      latestHistoricalEbitda: 200_000,
      smartDefaults: {
        revenueGrowthPct: 12,
        ebitdaMarginPct: 24,
        capexPct: 8,
        daPct: 7,
        nwcPct: 3,
        taxRatePct: 25,
        waccPct: 13,
        terminalGrowthPct: 3,
      },
      integrationDerivedCapexPct: 6,
      integrationDerivedDaPct: 5,
    })

    expect(patch).toEqual({
      dcf_wacc_pct: 9.5,
      dcf_terminal_growth_pct: 2.25,
      dcf_revenue_growth_pct: 4.5,
      dcf_ebitda_margin_pct: 18.5,
      dcf_capex_pct: 3.5,
      dcf_da_pct: 2.5,
      dcf_nwc_pct: 0.75,
      dcf_tax_rate_pct: 20.5,
    })
  })
})
