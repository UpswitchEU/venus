import { describe, expect, it } from 'vitest'

import {
  LAST_VALUATION_REQUEST_SESSION_KEY,
  mergeLastValuationRequestIntoSessionData,
  mergeSessionDataForReportAssets,
} from '../sessionPackageHelpers'

describe('mergeLastValuationRequestIntoSessionData', () => {
  it('merges request snapshot onto session data', () => {
    const out = mergeLastValuationRequestIntoSessionData({ company_name: 'X' }, {
      country_code: 'BE',
    } as Record<string, unknown>)
    expect(out.company_name).toBe('X')
    expect(out[LAST_VALUATION_REQUEST_SESSION_KEY]).toEqual({ country_code: 'BE' })
  })

  it('handles null session data', () => {
    const out = mergeLastValuationRequestIntoSessionData(null, { a: 1 })
    expect(out[LAST_VALUATION_REQUEST_SESSION_KEY]).toEqual({ a: 1 })
  })
})

describe('mergeSessionDataForReportAssets', () => {
  it('bundles tax latencies with the valuation request snapshot', () => {
    const items = [{ id: '1', type: 'active' as const }]
    const out = mergeSessionDataForReportAssets({ company_name: 'Y' }, { industry: 'x' }, items)
    expect(out.company_name).toBe('Y')
    expect(out._taxLatencies).toEqual(items)
    expect(out[LAST_VALUATION_REQUEST_SESSION_KEY]).toEqual({ industry: 'x' })
  })

  it('overlays filing-normalized financials from the request so the draft matches calculate', () => {
    const request = {
      current_year_data: { year: 2024, revenue: 1_000_000, ebitda: 200_000 },
      historical_years_data: [
        { year: 2023, revenue: 900_000, ebitda: 90_000, ebitda_normalized: false },
      ],
      forecast_years_data: [],
      recurring_revenue_percentage: 0.4,
      projection_years: 6,
    }
    const out = mergeSessionDataForReportAssets(
      {
        company_name: 'Z',
        current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
        revenue: 1_000_000,
        ebitda: 100_000,
        historical_years_data: [],
        projection_years: 5,
      },
      request,
      []
    )
    expect(out.current_year_data).toEqual(request.current_year_data)
    expect(out.historical_years_data).toEqual(request.historical_years_data)
    expect(out.forecast_years_data).toEqual([])
    expect(out.recurring_revenue_percentage).toBe(0.4)
    expect(out.projection_years).toBe(6)
    expect(out.revenue).toBe(1_000_000)
    expect(out.ebitda).toBe(200_000)
    expect(out.company_name).toBe('Z')
  })

  it('overlays owner_salary_addback from the valuation request onto the package', () => {
    const out = mergeSessionDataForReportAssets(
      { company_name: 'Co', owner_salary_addback: 50_000 },
      { owner_salary_addback: 80_000, current_year_data: { year: 2024, revenue: 1, ebitda: 1 } },
      []
    )
    expect(out.owner_salary_addback).toBe(80_000)
  })

  it('overlays dcf_input_mode and comparables from the valuation request', () => {
    const comps = [{ name: 'PeerCo', ev_ebitda_multiple: 8 }]
    const out = mergeSessionDataForReportAssets(
      { dcf_input_mode: 'ebitda', comparables: [] },
      {
        dcf_input_mode: 'fcff_only',
        user_configured_dcf: true,
        comparables: comps,
        current_year_data: { year: 2024, revenue: 1, ebitda: 1 },
      },
      []
    )
    expect(out.dcf_input_mode).toBe('fcff_only')
    expect(out.user_configured_dcf).toBe(true)
    expect(out.comparables).toEqual(comps)
  })

  it('overlays synthesis user_weights from the valuation request', () => {
    const w = { dcf: 0.4, ebitda_multiple: 0.6 }
    const out = mergeSessionDataForReportAssets(
      { user_weights: { dcf: 0.5, ebitda_multiple: 0.5 } },
      {
        user_weights: w,
        user_weight_justification: 'Test note',
        current_year_data: { year: 2024, revenue: 1, ebitda: 1 },
      },
      []
    )
    expect(out.user_weights).toEqual(w)
    expect(out.user_weight_justification).toBe('Test note')
  })

  it('overlays APV DCF convention and tax-shield schedule from the valuation request', () => {
    const out = mergeSessionDataForReportAssets(
      {
        dcf_discounting_convention: 'mid_year',
        dcf_tax_shield_projections: [999],
      },
      {
        current_year_data: { year: 2024, revenue: 1, ebitda: 1 },
        dcf_discounting_convention: 'year_end',
        dcf_tax_shield_projections: [1.5, 1.125, 0.75, 0.375, 0],
      },
      []
    )

    expect(out.dcf_discounting_convention).toBe('year_end')
    expect(out.dcf_tax_shield_projections).toEqual([1.5, 1.125, 0.75, 0.375, 0])
  })

  it('preserves method-specific scalars from the session snapshot when overlaying the request', () => {
    const out = mergeSessionDataForReportAssets(
      {
        company_name: 'SaaS Co',
        saas_arr: 2_000_000,
        dcf_wacc_pct: 10,
        nav_hidden_reserves: 15_000,
        owner_salary_addback: 60_000,
      },
      {
        current_year_data: { year: 2024, revenue: 3_000_000, ebitda: 600_000 },
        owner_salary_addback: 72_000,
      },
      []
    )
    expect(out.saas_arr).toBe(2_000_000)
    expect(out.dcf_wacc_pct).toBe(10)
    expect(out.nav_hidden_reserves).toBe(15_000)
    expect(out.owner_salary_addback).toBe(72_000)
    expect(out.current_year_data).toEqual({ year: 2024, revenue: 3_000_000, ebitda: 600_000 })
  })
})
