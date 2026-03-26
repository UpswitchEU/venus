import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '../../types/valuation'
import { buildValuationRequest } from '../buildValuationRequest'
import { getCurrentFilingYear } from '../fiscalYear'
import { getCompleteYearlyFinancialsDesc } from '../yearlyFinancials'

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
      { year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 90_000 },
    ],
    recurring_revenue_percentage: 0.5,
    ...overrides,
  } as ValuationFormData
}

describe('buildValuationRequest', () => {
  it('preserves zero historical years when none were entered', () => {
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [],
      }),
      []
    )

    expect(result.historical_years_data).toEqual([])
  })

  it('preserves a single historical year exactly as entered', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [{ year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000 }],
      }),
      []
    )

    expect(result.historical_years_data).toEqual([
      { year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000, ebitda_normalized: false },
    ])
  })

  it('sorts multiple historical years oldest-to-newest', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: lastFullYear - 1, revenue: 950_000, ebitda: 95_000 },
          { year: lastFullYear - 2, revenue: 850_000, ebitda: 85_000 },
        ],
      }),
      []
    )

    expect(result.historical_years_data.map((year) => year.year)).toEqual([
      lastFullYear - 2,
      lastFullYear - 1,
    ])
  })

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

    expect(result.current_year_data.year).toBe(getCurrentFilingYear())
  })

  it('always forces shares_for_sale to 100', () => {
    const decimalResult = buildValuationRequest(
      makeFormData({
        shares_for_sale: 33.33,
      }),
      []
    )
    const zeroResult = buildValuationRequest(
      makeFormData({
        shares_for_sale: 0,
      }),
      []
    )
    const defaultResult = buildValuationRequest(makeFormData(), [])

    expect(decimalResult.shares_for_sale).toBe(100)
    expect(zeroResult.shares_for_sale).toBe(100)
    expect(defaultResult.shares_for_sale).toBe(100)
  })

  it('keeps zero EBITDA as the reported baseline for normalization math', () => {
    const lastFullYear = getCurrentFilingYear()
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

  it('rejects missing or non-positive current-year revenue', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          revenue: 0,
          current_year_data: {
            year: getCurrentFilingYear(),
            revenue: 0,
            ebitda: 100_000,
          },
        }),
        []
      )
    ).toThrow('Revenue is required and must be greater than 0.')
  })

  it('accepts the latest complete year when newer placeholder years are empty', () => {
    const lastFullYear = getCurrentFilingYear()
    const yearlyFinancials = [
      { year: '2025', revenue: 0, ebitda: 0 },
      { year: '2024', revenue: 1_500_000, ebitda: 250_000 },
      { year: '2023', revenue: 1_000_000, ebitda: 100_000 },
    ]
    const [current, ...historical] = getCompleteYearlyFinancialsDesc(yearlyFinancials)

    const result = buildValuationRequest(
      makeFormData({
        revenue: current.revenue,
        ebitda: current.ebitda,
        current_year_data: {
          year: Number(current.year),
          revenue: current.revenue,
          ebitda: current.ebitda,
        },
        historical_years_data: historical.map((year) => ({
          year: Number(year.year),
          revenue: year.revenue,
          ebitda: year.ebitda,
        })),
      }),
      []
    )

    expect(result.current_year_data.year).toBe(lastFullYear)
    expect(result.current_year_data.revenue).toBe(1_500_000)
    expect(result.historical_years_data).toEqual([
      { year: 2023, revenue: 1_000_000, ebitda: 100_000, ebitda_normalized: false },
    ])
  })

  it('rejects historical revenue that Python would refuse', () => {
    const lastFullYear = getCurrentFilingYear()

    expect(() =>
      buildValuationRequest(
        makeFormData({
          historical_years_data: [{ year: lastFullYear - 1, revenue: 0, ebitda: 90_000 }],
        }),
        []
      )
    ).toThrow('Revenue is required and must be greater than 0.')
  })

  it('rejects historical years that duplicate the current fiscal year', () => {
    const lastFullYear = getCurrentFilingYear()

    expect(() =>
      buildValuationRequest(
        makeFormData({
          historical_years_data: [{ year: lastFullYear, revenue: 900_000, ebitda: 90_000 }],
        }),
        []
      )
    ).toThrow(`Historical year ${lastFullYear} must be earlier than the current fiscal year ${lastFullYear}.`)
  })

  it('strips forecast rows from historical_years_data to protect engine integrity', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000 },
          { year: lastFullYear + 1, revenue: 500_000, ebitda: 50_000, is_forecast: true },
          { year: lastFullYear + 2, revenue: 600_000, ebitda: 60_000, is_forecast: true },
        ],
      }),
      []
    )

    expect(result.historical_years_data).toHaveLength(1)
    expect(result.historical_years_data[0].year).toBe(lastFullYear - 1)
    expect(result.historical_years_data.every((y: any) => !y.is_forecast)).toBe(true)
  })

  it('still produces valid output when all historical rows are forecast-only', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: lastFullYear + 1, revenue: 0, ebitda: 0, is_forecast: true },
          { year: lastFullYear + 2, revenue: 0, ebitda: 0, is_forecast: true },
        ],
      }),
      []
    )

    expect(result.historical_years_data).toHaveLength(0)
  })

  it('emits forecast_years_data separately from historical actuals', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [{ year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000 }],
        forecast_years_data: [
          {
            year: lastFullYear + 1,
            revenue: 100_000,
            ebitda: 10_000,
            depreciation: 2_000,
            cash: 8_000,
            nwc_change: -1_000,
          },
          { year: lastFullYear + 2, revenue: 110_000, ebitda: 11_000 },
        ],
      } as any),
      []
    )
    expect(result.historical_years_data).toEqual([
      { year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000, ebitda_normalized: false },
    ])
    expect(result.forecast_years_data).toEqual([
      {
        year: lastFullYear + 1,
        revenue: 100_000,
        ebitda: 10_000,
        depreciation: 2_000,
        cash: 8_000,
        nwc_change: -1_000,
        is_forecast: true,
      },
      { year: lastFullYear + 2, revenue: 110_000, ebitda: 11_000, is_forecast: true },
    ])
  })

  it('uses revenue-quality fallback for recurring revenue when the base field is absent', () => {
    const result = buildValuationRequest(
      makeFormData({
        recurring_revenue_percentage: undefined,
        rev_recurring_pct: 65,
      }),
      []
    )

    expect(result.recurring_revenue_percentage).toBe(0.65)
  })

  it('serializes adaptive DCF and NAV inputs into business_context', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'saas',
        dcf_revenue_growth_pct: 12,
        dcf_wacc_pct: 9,
        nav_real_estate_adjustment: 150_000,
        saas_arr_growth_pct: 32,
        saas_customer_churn_pct: 6,
        saas_gross_margin_pct: 81,
        saas_expansion_revenue_pct: 18,
        saas_sm_spend: 120_000,
        rev_top_client_concentration_pct: 18,
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.business_context).toMatchObject({
      dcf_revenue_growth_pct: 12,
      dcf_wacc_pct: 9,
      nav_real_estate_adjustment: 150_000,
      saas_arr_growth_pct: 32,
      saas_customer_churn_pct: 6,
      saas_gross_margin_pct: 81,
      saas_expansion_revenue_pct: 18,
      saas_sm_spend: 120_000,
      rev_top_client_concentration_pct: 18,
    })
  })
})
