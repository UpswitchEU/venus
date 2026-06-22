import { describe, expect, it } from 'vitest'
import type { YearDataInput } from '../../types/valuation'
import { buildValuationRequest } from '../buildValuationRequest'
import { getCurrentFilingYear } from '../fiscalYear'
import { makeFormData, type ValuationRequestExtras } from './buildValuationRequest.testUtils'

describe('buildValuationRequest business segments and forecast hygiene', () => {
  it('forwards multi-segment business type earnings for true SOTP valuation', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'recycling',
        business_type_segments: [
          {
            business_type_id: 'recycling',
            business_type_title: 'Recycling Services',
            basis: 'EBITDA',
            earnings: '700000',
            multiple: 4.2,
            weight: '70',
          },
          {
            business_type_id: 'transport',
            business_type_title: 'Transport',
            earnings_basis: 'Revenue',
            earnings: '300000',
            multiple: '1.1',
            weight: 30,
          },
        ],
      }),
      []
    )

    expect(result.business_type_segments).toEqual([
      {
        business_type_id: 'recycling',
        business_type_title: 'Recycling Services',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        earnings: 700000,
        multiple: 4.2,
        weight: 70,
      },
      {
        business_type_id: 'transport',
        business_type_title: 'Transport',
        basis: 'Revenue',
        earnings_basis: 'Revenue',
        earnings: 300000,
        multiple: 1.1,
        weight: 30,
      },
    ])
    expect(result.business_type_mix).toEqual(result.business_type_segments)
    expect(result.business_type_weights).toEqual({
      recycling: 70,
      transport: 30,
    })
  })

  it('falls back to business_type_mix when form segments are empty', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'recycling',
        business_type_segments: [],
        business_type_mix: [
          {
            business_type_id: 'recycling',
            business_type_title: 'Recycling Services',
            weight: 70,
          },
          {
            business_type_id: 'transport',
            business_type_title: 'Transport',
            weight: 30,
          },
        ],
      }),
      []
    )

    expect(result.business_type_segments).toEqual([
      {
        business_type_id: 'recycling',
        business_type_title: 'Recycling Services',
        weight: 70,
      },
      {
        business_type_id: 'transport',
        business_type_title: 'Transport',
        weight: 30,
      },
    ])
    expect(result.business_type_mix).toEqual(result.business_type_segments)
    expect(result.business_type_weights).toEqual({
      recycling: 70,
      transport: 30,
    })
  })

  it('forwards a single business type segment as a 100% benchmark mix', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'recycling',
        business_type_segments: [
          {
            business_type_id: 'recycling',
            business_type_title: 'Recycling Services',
            basis: 'EBITDA',
            earnings: 700000,
            multiple: 4.2,
          },
        ],
      }),
      []
    )

    expect(result.business_type_segments).toEqual([
      {
        business_type_id: 'recycling',
        business_type_title: 'Recycling Services',
        basis: 'EBITDA',
        earnings_basis: 'EBITDA',
        earnings: 700000,
        multiple: 4.2,
      },
    ])
  })

  it('drops zero-revenue historical rows even when normalization metadata targets them', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: lastFullYear - 1, revenue: 0, ebitda: 0 },
          { year: lastFullYear - 2, revenue: 0, ebitda: 0 },
        ],
      }),
      [
        {
          id: 'norm-all-years',
          title: 'Owner compensation',
          rationale: 'Normalize owner comp across visible years',
          category: 'salary',
          type: 'add',
          value: 10_000,
          adjustment: 10_000,
          year: lastFullYear,
          applyAllYears: true,
          status: 'accepted',
          source: 'manual',
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    expect(result.current_year_data.ebitda).toBe(110_000)
    expect(result.current_year_data.ebitda_normalized).toBe(true)
    expect(result.historical_years_data).toEqual([])
  })

  it('drops all-zero historical placeholders before building a DCF request', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        company_name: 'Sandra Lemmens',
        country_code: 'BE',
        industry: 'healthcare',
        revenue: 1_000_000,
        ebitda: 100_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [
          { year: lastFullYear - 1, revenue: 0, ebitda: 0 },
          { year: lastFullYear - 2, revenue: 0, ebitda: 0 },
          { year: lastFullYear - 3, revenue: 0, ebitda: 0 },
        ],
        dcf_input_mode: 'ebitda',
        dcf_wacc_pct: 10,
        dcf_terminal_growth_pct: 2,
      }),
      []
    )

    expect(result.historical_years_data).toEqual([])
    expect(result.current_year_data).toMatchObject({
      year: lastFullYear,
      revenue: 1_000_000,
      ebitda: 100_000,
    })
    expect(result.business_context).toMatchObject({
      dcf_wacc_pct: 10,
      dcf_terminal_growth_pct: 2,
    })
    expect(result.use_dcf).toBe(true)
  })

  it('serializes NACE routing fields when available', () => {
    const result = buildValuationRequest(
      makeFormData({
        nace_code: '64.20',
        nace_description: 'Activiteiten van holdings',
        activity_code: '64.20',
        canonical_nace_code: '64.20',
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.nace_code).toBe('64.20')
    expect(result.nace_description).toBe('Activiteiten van holdings')
    expect((result as ValuationRequestExtras).activity_code).toBe('64.20')
    expect((result as ValuationRequestExtras).canonical_nace_code).toBe('64.20')
  })

  it('preserves imported SaaS provenance while letting explicit SaaS form fields win', () => {
    const result = buildValuationRequest(
      makeFormData({
        saas_arr: 700_000,
        saas_mrr: 58_333,
        business_context: {
          _imported_saas_metrics: {
            saas_arr: 650_000,
            saas_mrr: 54_166,
          },
          _imported_saas_provenance: {
            source: 'exact',
            confidence: 0.82,
          },
        },
      }),
      []
    )

    const businessContext = result.business_context as ValuationRequestExtras
    expect(businessContext.saas_arr).toBe(700_000)
    expect(businessContext.saas_mrr).toBe(58_333)
    expect(businessContext._imported_saas_metrics).toEqual({
      saas_arr: 650_000,
      saas_mrr: 54_166,
    })
    expect(businessContext._imported_saas_provenance).toEqual({
      source: 'exact',
      confidence: 0.82,
    })
  })

  it('drops negative historical revenue before building the request', () => {
    const lastFullYear = getCurrentFilingYear()

    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [{ year: lastFullYear - 1, revenue: -1, ebitda: 90_000 }],
      }),
      []
    )

    expect(result.historical_years_data).toEqual([])
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
    ).toThrow(
      `Historical year ${lastFullYear} must be earlier than the current fiscal year ${lastFullYear}.`
    )
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
    expect(
      result.historical_years_data.every(
        (yearData: YearDataInput & { is_forecast?: boolean }) => !yearData.is_forecast
      )
    ).toBe(true)
  })

  it('strips camelCase forecast rows from historical_years_data', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000 },
          {
            year: lastFullYear + 1,
            revenue: 500_000,
            ebitda: 50_000,
            isForecast: true,
          } as YearDataInput,
        ],
      }),
      []
    )

    expect(result.historical_years_data).toHaveLength(1)
    expect(result.historical_years_data[0].year).toBe(lastFullYear - 1)
    expect(result.forecast_years_data?.some((y) => y.year === lastFullYear + 1)).toBe(true)
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
            capex: 7_500,
            depreciation: 2_000,
            cash: 8_000,
            nwc_change: -1_000,
          },
          { year: lastFullYear + 2, revenue: 110_000, ebitda: 11_000 },
        ],
      }),
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
        capex: 7_500,
        depreciation: 2_000,
        cash: 8_000,
        nwc_change: -1_000,
        is_forecast: true,
      },
      { year: lastFullYear + 2, revenue: 110_000, ebitda: 11_000, is_forecast: true },
    ])
  })

  it('emits explicit free_cash_flow in FCFF-only mode', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        dcf_input_mode: 'fcff_only',
        historical_years_data: [{ year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000 }],
        forecast_years_data: [
          { year: lastFullYear + 1, revenue: 0, ebitda: 0, free_cash_flow: 50_000 },
          { year: lastFullYear + 2, revenue: 0, ebitda: 0, free_cash_flow: 55_000 },
        ],
      }),
      []
    )
    expect(result.dcf_input_mode).toBe('fcff_only')
    expect(result.forecast_years_data).toEqual([
      {
        year: lastFullYear + 1,
        revenue: 0,
        ebitda: 0,
        free_cash_flow: 50_000,
        is_forecast: true,
      },
      {
        year: lastFullYear + 2,
        revenue: 0,
        ebitda: 0,
        free_cash_flow: 55_000,
        is_forecast: true,
      },
    ])
  })

  it('preserves imported DCF detail fields on actual years', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: lastFullYear,
          revenue: 1_000_000,
          ebitda: 100_000,
          capex: 45_000,
          tax_expense: 22_000,
          current_assets: 300_000,
          current_liabilities: 140_000,
          cash: 40_000,
          accounts_receivable: 120_000,
          accounts_payable: 60_000,
          short_term_debt: 15_000,
        },
        historical_years_data: [
          {
            year: lastFullYear - 1,
            revenue: 900_000,
            ebitda: 90_000,
            capex: 40_000,
            tax_expense: 20_000,
            current_assets: 260_000,
            current_liabilities: 120_000,
            cash: 30_000,
            accounts_receivable: 100_000,
            accounts_payable: 55_000,
            short_term_debt: 10_000,
          },
        ],
      }),
      []
    )

    expect(result.current_year_data).toMatchObject({
      capex: 45_000,
      tax_expense: 22_000,
      accounts_payable: 60_000,
      short_term_debt: 15_000,
    })
    expect(result.historical_years_data[0]).toMatchObject({
      capex: 40_000,
      tax_expense: 20_000,
      accounts_payable: 55_000,
      short_term_debt: 10_000,
    })
  })

  it('derives current-year nwc_change from imported balance-sheet detail when missing', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: lastFullYear,
          revenue: 1_000_000,
          ebitda: 100_000,
          current_assets: 320_000,
          cash: 50_000,
          current_liabilities: 170_000,
          short_term_debt: 20_000,
        },
        historical_years_data: [
          {
            year: lastFullYear - 1,
            revenue: 900_000,
            ebitda: 90_000,
            current_assets: 280_000,
            cash: 40_000,
            current_liabilities: 150_000,
            short_term_debt: 10_000,
          },
        ],
      }),
      []
    )

    expect(result.current_year_data.nwc_change).toBe(20_000)
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

  it('passes raw revenue-quality amounts through business_context', () => {
    const result = buildValuationRequest(
      makeFormData({
        recurring_revenue_percentage: undefined,
        revenue: 1_000_000,
        rev_recurring_amount: 400_000,
        rev_top_client_amount: 150_000,
        rev_contract_backlog: 250_000,
      }),
      []
    )

    expect(result.recurring_revenue_percentage).toBe(0.4)
    expect(result.business_context).toMatchObject({
      rev_recurring_amount: 400_000,
      rev_recurring_pct: 40,
      rev_top_client_amount: 150_000,
      rev_top_client_concentration_pct: 15,
      rev_contract_backlog: 250_000,
    })
  })

  it('normalizes Belgian/Dutch formatted numeric strings before building the API payload', () => {
    const filingYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        recurring_revenue_percentage: undefined,
        revenue: '1.000.000',
        ebitda: '100.000',
        current_year_data: {
          year: filingYear,
          revenue: '1.000.000',
          ebitda: '100.000',
        },
        historical_years_data: [
          {
            year: filingYear - 1,
            revenue: '900.000',
            ebitda: '90.000',
          },
        ],
        rev_recurring_amount: '400.000',
        rev_top_client_amount: '150.000',
        rev_contract_backlog: '250.000',
        dcf_wacc_pct: '10,5',
      } as unknown as Partial<ValuationFormData>),
      []
    )

    expect(result.current_year_data.revenue).toBe(1_000_000)
    expect(result.current_year_data.ebitda).toBe(100_000)
    expect(result.historical_years_data).toEqual([
      {
        year: filingYear - 1,
        revenue: 900_000,
        ebitda: 90_000,
        ebitda_normalized: false,
      },
    ])
    expect(result.recurring_revenue_percentage).toBe(0.4)
    expect(result.business_context).toMatchObject({
      rev_recurring_amount: 400_000,
      rev_recurring_pct: 40,
      rev_top_client_amount: 150_000,
      rev_top_client_concentration_pct: 15,
      rev_contract_backlog: 250_000,
      dcf_wacc_pct: 10.5,
    })
  })
})
