import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '../../types/valuation'
import { buildValuationRequest } from '../buildValuationRequest'
import { getLastFullFiscalYear } from '../fiscalYear'

function makeFormData(overrides: Partial<ValuationFormData> = {}): ValuationFormData {
  return {
    company_name: 'Metaalwerken Geuns',
    country_code: 'BE',
    founding_year: 2010,
    industry: 'manufacturing',
    business_model: 'services',
    revenue: 1_000_000,
    ebitda: 100_000,
    current_year_data: {
      year: 2099,
      revenue: 1_000_000,
      ebitda: 100_000,
      total_assets: 500_000,
      total_debt: 100_000,
      cash: 25_000,
    },
    historical_years_data: [
      { year: getLastFullFiscalYear() - 1, revenue: 900_000, ebitda: 90_000 },
    ],
    recurring_revenue_percentage: 0.5,
    ...overrides,
  } as ValuationFormData
}

describe('buildValuationRequest', () => {
  it('preserves explicit zero balance-sheet values in current year data', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: 2099,
          revenue: 1_000_000,
          ebitda: 100_000,
          total_assets: 0,
          total_debt: 0,
          cash: 0,
        },
      }),
      []
    )

    expect(result.current_year_data.total_assets).toBe(0)
    expect(result.current_year_data.total_debt).toBe(0)
    expect(result.current_year_data.cash).toBe(0)
  })

  it('always uses the last closed fiscal year for current_year_data', () => {
    const result = buildValuationRequest(makeFormData(), [])

    expect(result.current_year_data.year).toBe(getLastFullFiscalYear())
  })

  it('keeps zero EBITDA as the reported baseline for normalization math', () => {
    const lastFullYear = getLastFullFiscalYear()
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 0,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_000_000,
          ebitda: 0,
          total_assets: 0,
          total_debt: 0,
          cash: 0,
        },
      }),
      [
        {
          id: 'norm-1',
          title: 'Owner compensation',
          rationale: 'Normalize owner comp',
          category: 'salary',
          type: 'add',
          value: 10_000,
          adjustment: 10_000,
          year: lastFullYear,
          status: 'accepted',
          source: 'manual',
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    expect(result.current_year_data.ebitda).toBe(10_000)
    expect(result.current_year_data.ebitda_normalization_metadata?.reported_ebitda).toBe(0)
    expect(result.current_year_data.ebitda_normalization_metadata?.total_adjustments).toBe(10_000)
  })
})
