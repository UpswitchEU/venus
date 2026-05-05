import { describe, expect, it } from 'vitest'

import { getCurrentFilingYear } from '../fiscalYear'
import {
  getSessionOptionalPrefillSignature,
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
  stableOptionalPrefillSourceSignature,
} from '../mergeOptionalSessionPrefillFields'

const baseForm = {
  business_model: 'services',
  founding_year: 2010,
} as any

describe('stableOptionalPrefillSourceSignature', () => {
  it('is stable for same optional content and ignores unrelated keys', () => {
    const a = { company_name: 'X', dcf_wacc_pct: 9.5, nav_hidden_reserves: 1 }
    const b = { company_name: 'Y', dcf_wacc_pct: 9.5, nav_hidden_reserves: 1, _foo: 1 }
    expect(stableOptionalPrefillSourceSignature(a)).toBe(stableOptionalPrefillSourceSignature(b))
  })

  it('changes when _internal_key_metrics changes', () => {
    const a = { _internal_key_metrics: ['ebitda'] }
    const b = { _internal_key_metrics: ['ebitda', 'revenue'] }
    expect(stableOptionalPrefillSourceSignature(a)).not.toBe(
      stableOptionalPrefillSourceSignature(b)
    )
  })

  it('includes year_data financial fingerprint (not only key count)', () => {
    const s1 = stableOptionalPrefillSourceSignature({
      year_data: { '2023': { revenue: 1, ebitda: 1 }, '2022': { revenue: 2, ebitda: 2 } },
    })
    const s2 = stableOptionalPrefillSourceSignature({
      year_data: { '2023': { revenue: 99, ebitda: 1 }, '2022': { revenue: 2, ebitda: 2 } },
    })
    expect(s1).toContain('year_data:')
    expect(s1).not.toBe(s2)
  })

  it('changes when historical row values change at same length', () => {
    const a = stableOptionalPrefillSourceSignature({
      historical_years_data: [{ year: 2022, revenue: 100, ebitda: 10 }],
    })
    const b = stableOptionalPrefillSourceSignature({
      historical_years_data: [{ year: 2022, revenue: 200, ebitda: 10 }],
    })
    expect(a).not.toBe(b)
  })

  it('getSessionOptionalPrefillSignature merges _businessInfo into the signed surface', () => {
    const sig = getSessionOptionalPrefillSignature({
      _businessInfo: { dcf_wacc_pct: 8 },
      revenue: 1,
    })
    expect(sig).toContain('dcf_wacc_pct:8')
    expect(sig).toContain('revenue:1')
  })

  it('normalizes filing_year_confirmed in fingerprint (boolean vs string "1")', () => {
    expect(
      stableOptionalPrefillSourceSignature({ filing_year_confirmed: true } as Record<
        string,
        unknown
      >)
    ).toBe(
      stableOptionalPrefillSourceSignature({ filing_year_confirmed: '1' } as Record<
        string,
        unknown
      >)
    )
  })
})

describe('mergeSessionSurfaceForOptionalPrefill', () => {
  it('does not let top-level empty string mask company_name on the business card', () => {
    const m = mergeSessionSurfaceForOptionalPrefill({
      company_name: '',
      _businessInfo: { company_name: 'Acme BV', kbo_number: '0123456789' },
    })
    expect(m.company_name).toBe('Acme BV')
    expect(m.kbo_number).toBe('0123456789')
  })

  it('keeps a non-empty top-level value when both top and card differ', () => {
    const m = mergeSessionSurfaceForOptionalPrefill({
      company_name: 'Top Co',
      _businessInfo: { company_name: 'Card Co' },
    })
    expect(m.company_name).toBe('Top Co')
  })

  it('fills historical_years_data from the card when top-level is an empty array', () => {
    const hist = [{ year: 2022, revenue: 1, ebitda: 1 }]
    const m = mergeSessionSurfaceForOptionalPrefill({
      historical_years_data: [],
      _businessInfo: { historical_years_data: hist },
    })
    expect(m.historical_years_data).toEqual(hist)
  })

  it('fills year_data from the card when top-level map is empty', () => {
    const yd = { '2022': { revenue: 1, ebitda: 1 } }
    const m = mergeSessionSurfaceForOptionalPrefill({
      year_data: {},
      _businessInfo: { year_data: yd },
    })
    expect(m.year_data).toEqual(yd)
  })
})

describe('mergeOptionalSessionPrefillFields', () => {
  it('fills empty DCF and NAV scalars when session has them', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        dcf_wacc_pct: 9.5,
        dcf_terminal_growth_pct: 2.5,
        nav_hidden_reserves: 10000,
        shares_for_sale: 100,
      },
      baseForm
    )
    expect(patch.dcf_wacc_pct).toBe(9.5)
    expect(patch.nav_hidden_reserves).toBe(10000)
    expect(patch.shares_for_sale).toBe(100)
  })

  it('does not overwrite existing user values', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { dcf_wacc_pct: 9.5, nav_hidden_reserves: 999 },
      { ...baseForm, dcf_wacc_pct: 8 } as any
    )
    expect(patch.dcf_wacc_pct).toBeUndefined()
    expect(patch.nav_hidden_reserves).toBe(999)
  })

  it('fills dcf_terminal_value_method when empty', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { dcf_terminal_value_method: 'exit_multiple' },
      baseForm
    )
    expect(patch.dcf_terminal_value_method).toBe('exit_multiple')
  })

  it('fills revenue and recurring_revenue_percentage when empty', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { revenue: 1_000_000, recurring_revenue_percentage: 40, activity_code: '62010' },
      baseForm
    )
    expect(patch.revenue).toBe(1_000_000)
    expect(patch.recurring_revenue_percentage).toBe(40)
    expect(patch.activity_code).toBe('62010')
  })

  it('merges tax_latencies and balance_sheet_adjustments when form arrays empty', () => {
    const tl = [
      { type: 'active' as const, description: 'x', temporary_difference: 1, tax_rate: 0.25 },
    ]
    const patch = mergeOptionalSessionPrefillFields(
      {
        tax_latencies: tl,
        balance_sheet_adjustments: [
          { id: '1', label: 'a', amount: 1, type: 'add', category: 'other' },
        ],
      },
      baseForm
    )
    expect(patch.tax_latencies).toEqual(tl)
    expect(patch.balance_sheet_adjustments?.length).toBe(1)
  })

  it('merges historical_years_data when form has no historical rows', () => {
    const rows = [
      { year: 2022, revenue: 100, ebitda: 10 },
      { year: 2021, revenue: 90, ebitda: 9 },
    ]
    const patch = mergeOptionalSessionPrefillFields({ historical_years_data: rows }, baseForm)
    expect(patch.historical_years_data?.length).toBeGreaterThan(0)
    expect(patch.historical_years_data?.every((r) => typeof r.year === 'number')).toBe(true)
  })

  it('merges current_year_data when form current year has no revenue/ebitda', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { current_year_data: { year: 2023, revenue: 1_000_000, ebitda: 100_000 } },
      { ...baseForm, current_year_data: { year: 2023 } } as any
    )
    expect(patch.current_year_data?.revenue).toBe(1_000_000)
    expect(patch.current_year_data?.ebitda).toBe(100_000)
  })

  it('merges forecast_years_data when form forecast empty', () => {
    const fc = [{ year: 2024, revenue: 1e6, ebitda: 1e5, is_forecast: true as const }]
    const patch = mergeOptionalSessionPrefillFields({ forecast_years_data: fc }, baseForm)
    expect(patch.forecast_years_data).toEqual(fc)
  })

  it('derives historical rows from year_data when historical_years_data absent', () => {
    const fy = getCurrentFilingYear()
    const patch = mergeOptionalSessionPrefillFields(
      {
        year_data: {
          [fy]: { revenue: 100, ebitda: 10 },
          [fy - 1]: { revenue: 90, ebitda: 9 },
        },
      },
      baseForm
    )
    expect(patch.historical_years_data?.length).toBeGreaterThan(0)
  })

  it('rebuilds yearlyFinancials when form only has placeholder zeros', () => {
    const fy = getCurrentFilingYear()
    const patch = mergeOptionalSessionPrefillFields(
      { historical_years_data: [{ year: fy - 1, revenue: 500_000, ebitda: 50_000 }] },
      {
        ...baseForm,
        yearlyFinancials: [
          { year: String(fy), revenue: 0, ebitda: 0 },
          { year: String(fy - 1), revenue: 0, ebitda: 0 },
        ],
      } as any
    )
    expect(patch.yearlyFinancials?.some((r) => r.revenue === 500_000)).toBe(true)
  })

  it('fills top-level revenue/ebitda from nested current_year_data when empty', () => {
    const fy = getCurrentFilingYear()
    const patch = mergeOptionalSessionPrefillFields(
      { current_year_data: { year: fy, revenue: 888_000, ebitda: 88_000 } },
      baseForm
    )
    expect(patch.revenue).toBe(888_000)
    expect(patch.ebitda).toBe(88_000)
  })

  it('does not overwrite existing historical_years_data', () => {
    const existing = [{ year: 2020, revenue: 1, ebitda: 1 }]
    const patch = mergeOptionalSessionPrefillFields(
      { historical_years_data: [{ year: 2019, revenue: 2, ebitda: 2 }] },
      { ...baseForm, historical_years_data: existing } as any
    )
    expect(patch.historical_years_data).toBeUndefined()
  })
})
