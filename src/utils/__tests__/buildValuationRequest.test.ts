import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type { ValuationFormData } from '../../types/valuation'
import {
  applyDcfProjectionPreviewToForecastRows,
  deriveDcfProjectionPreview,
} from '../../components/calculator/sections/dcfProjectionPreview'
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
    historical_years_data: [{ year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 90_000 }],
    recurring_revenue_percentage: 0.5,
    ...overrides,
  } as ValuationFormData
}

describe('buildValuationRequest', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps UK registry shorthand to GB on the wire (ISO-3166)', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'UK',
      }),
      []
    )
    expect(result.country_code).toBe('GB')
  })

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

  it('uses the default filing year for current_year_data when no explicit year is provided', () => {
    const result = buildValuationRequest(makeFormData(), [])

    expect(result.current_year_data.year).toBe(getCurrentFilingYear())
  })

  it('clamps an unconfirmed explicit year to the filing year in H1', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: getCurrentFilingYear() + 1,
          revenue: 1_500_000,
          ebitda: 250_000,
        },
      }),
      []
    )

    expect(result.current_year_data.year).toBe(getCurrentFilingYear())
  })

  it('drops unconfirmed historical rows that are ahead of the filing year in H1', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: getCurrentFilingYear() + 1,
          revenue: 1_500_000,
          ebitda: 250_000,
        },
        historical_years_data: [
          { year: getCurrentFilingYear() + 1, revenue: 1_200_000, ebitda: 200_000 },
          { year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 150_000 },
        ],
      }),
      []
    )

    expect(result.current_year_data.year).toBe(getCurrentFilingYear())
    expect(result.historical_years_data.map((year) => year.year)).toEqual([
      getCurrentFilingYear() - 1,
    ])
  })

  it('preserves an explicitly confirmed newer year for current_year_data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const result = buildValuationRequest(
      makeFormData({
        filing_year_confirmed: true,
        current_year_data: {
          year: getCurrentFilingYear() + 1,
          revenue: 1_500_000,
          ebitda: 250_000,
        },
      }),
      []
    )

    expect(result.current_year_data.year).toBe(getCurrentFilingYear() + 1)
  })

  it('rejects confirmed-year leakage into historical_years_data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    expect(() =>
      buildValuationRequest(
        makeFormData({
          filing_year_confirmed: true,
          current_year_data: {
            year: getCurrentFilingYear() + 1,
            revenue: 1_500_000,
            ebitda: 250_000,
          },
          historical_years_data: [
            { year: getCurrentFilingYear() + 1, revenue: 1_200_000, ebitda: 200_000 },
            { year: getCurrentFilingYear(), revenue: 900_000, ebitda: 150_000 },
          ],
        }),
        []
      )
    ).toThrow(
      `Historical year ${getCurrentFilingYear() + 1} must be earlier than the current fiscal year ${getCurrentFilingYear() + 1}.`
    )
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

  it('maps ledger-linked tax latencies into balance_sheet_adjustments without legacy double count', () => {
    useTaxLatencyStore.getState().setItems([
      {
        id: 'tl-1',
        type: 'passive',
        accountCode: '222000',
        accountName: 'Gebouwen',
        description: 'Belastinglatentie op meerwaarde gebouw',
        temporaryDifference: 150_000,
        taxRate: 25,
      },
    ])

    const result = buildValuationRequest(makeFormData(), [])

    expect(result.tax_latencies).toBeUndefined()
    expect(result.balance_sheet_adjustments).toEqual([
      expect.objectContaining({
        id: 'tl-1',
        label: 'Belastinglatentie op meerwaarde gebouw',
        category: 'tax_latency',
        type: 'subtract',
        amount: 37_500,
        account_code: '222000',
        temporary_difference: 150_000,
        tax_rate: 25,
        tax_latency_type: 'passive',
      }),
    ])

    useTaxLatencyStore.getState().clear()
  })

  it('merges tax latency adjustments with existing non-tax balance sheet adjustments', () => {
    useTaxLatencyStore.getState().setItems([
      {
        id: 'tl-1',
        type: 'passive',
        accountCode: '222000',
        accountName: 'Gebouwen',
        description: 'Belastinglatentie op meerwaarde gebouw',
        temporaryDifference: 150_000,
        taxRate: 25,
      },
    ])

    const result = buildValuationRequest(
      makeFormData({
        balance_sheet_adjustments: [
          {
            id: 'cash-1',
            label: 'Excess cash',
            amount: 20_000,
            type: 'add',
            category: 'excess_cash',
            description: 'Surplus cash position',
          },
        ],
      }),
      []
    )

    expect(result.balance_sheet_adjustments).toEqual([
      expect.objectContaining({
        id: 'cash-1',
        category: 'excess_cash',
      }),
      expect.objectContaining({
        id: 'tl-1',
        category: 'tax_latency',
        account_code: '222000',
        temporary_difference: 150_000,
        tax_rate: 25,
        tax_latency_type: 'passive',
      }),
    ])

    useTaxLatencyStore.getState().clear()
  })

  it('preserves existing tax latency adjustments when the tax latency store is empty', () => {
    useTaxLatencyStore.getState().clear()

    const result = buildValuationRequest(
      makeFormData({
        balance_sheet_adjustments: [
          {
            id: 'tl-existing',
            label: 'Persisted tax latency',
            amount: 12_500,
            type: 'subtract',
            category: 'tax_latency',
            description: 'Restored from persisted request',
            account_code: '160000',
          },
        ],
      }),
      []
    )

    expect(result.balance_sheet_adjustments).toEqual([
      expect.objectContaining({
        id: 'tl-existing',
        category: 'tax_latency',
        account_code: '160000',
      }),
    ])
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

  it('accepts zero current-year revenue for holdings and asset-based cases', () => {
    const result = buildValuationRequest(
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

    expect(result.current_year_data.revenue).toBe(0)
  })

  it('rejects missing or negative current-year revenue', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          revenue: -1,
          current_year_data: {
            year: getCurrentFilingYear(),
            revenue: -1,
            ebitda: 100_000,
          },
        }),
        []
      )
    ).toThrow('Revenue is required and cannot be negative.')
  })

  it('accepts the latest complete year when newer placeholder years are empty', () => {
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

    expect(result.current_year_data.year).toBe(2024)
    expect(result.current_year_data.revenue).toBe(1_500_000)
    expect(result.historical_years_data).toEqual([
      { year: 2023, revenue: 1_000_000, ebitda: 100_000, ebitda_normalized: false },
    ])
  })

  it('accepts zero historical revenue when the year is a genuine zero-revenue period', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [{ year: lastFullYear - 1, revenue: 0, ebitda: 90_000 }],
      }),
      []
    )

    expect(result.historical_years_data[0]).toMatchObject({
      year: lastFullYear - 1,
      revenue: 0,
      ebitda: 90_000,
    })
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
    expect((result as any).activity_code).toBe('64.20')
    expect((result as any).canonical_nace_code).toBe('64.20')
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

    expect((result.business_context as any).saas_arr).toBe(700_000)
    expect((result.business_context as any).saas_mrr).toBe(58_333)
    expect((result.business_context as any)._imported_saas_metrics).toEqual({
      saas_arr: 650_000,
      saas_mrr: 54_166,
    })
    expect((result.business_context as any)._imported_saas_provenance).toEqual({
      source: 'exact',
      confidence: 0.82,
    })
  })

  it('rejects historical revenue only when negative', () => {
    const lastFullYear = getCurrentFilingYear()

    expect(() =>
      buildValuationRequest(
        makeFormData({
          historical_years_data: [{ year: lastFullYear - 1, revenue: -1, ebitda: 90_000 }],
        }),
        []
      )
    ).toThrow('Revenue is required and cannot be negative.')
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
            capex: 7_500,
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
      } as any),
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

  it('forwards owner_salary_addback on the valuation request for SDE', () => {
    const result = buildValuationRequest(makeFormData({ owner_salary_addback: 85_000 }), [])
    expect(result.owner_salary_addback).toBe(85_000)
  })

  it('omits owner_salary_addback when unset or non-finite', () => {
    expect(buildValuationRequest(makeFormData({}), []).owner_salary_addback).toBeUndefined()
    expect(
      buildValuationRequest(makeFormData({ owner_salary_addback: Number.NaN as any }), [])
        .owner_salary_addback
    ).toBeUndefined()
  })

  it('serializes adaptive DCF and NAV inputs into business_context', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'saas',
        dcf_revenue_growth_pct: 12,
        dcf_nwc_pct: 4,
        dcf_wacc_pct: 9,
        dcf_exit_multiple: 6,
        dcf_risk_free_rate_pct: 3,
        dcf_equity_risk_premium_pct: 5.5,
        dcf_beta: 1.1,
        dcf_cost_of_debt_pct: 4.5,
        dcf_debt_equity_pct: 30,
        dcf_tax_shield_pct: 25,
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
      dcf_nwc_pct: 4,
      dcf_wacc_pct: 9,
      dcf_exit_multiple: 6,
      dcf_risk_free_rate_pct: 3,
      dcf_equity_risk_premium_pct: 5.5,
      dcf_beta: 1.1,
      dcf_cost_of_debt_pct: 4.5,
      dcf_debt_equity_pct: 30,
      dcf_tax_shield_pct: 25,
      nav_real_estate_adjustment: 150_000,
      saas_arr_growth_pct: 32,
      saas_customer_churn_pct: 6,
      saas_gross_margin_pct: 81,
      saas_expansion_revenue_pct: 18,
      saas_sm_spend: 120_000,
      rev_top_client_concentration_pct: 18,
    })
  })

  it('defaults DCF projection_years to 5 and expands with explicit forecast rows', () => {
    const baseResult = buildValuationRequest(makeFormData({}), [])
    expect(baseResult.projection_years).toBe(5)

    const lastFullYear = getCurrentFilingYear()
    const expandedResult = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: lastFullYear - 1, revenue: 900_000, ebitda: 90_000 },
          { year: lastFullYear + 1, revenue: 100_000, ebitda: 10_000, is_forecast: true },
          { year: lastFullYear + 2, revenue: 110_000, ebitda: 11_000, is_forecast: true },
          { year: lastFullYear + 3, revenue: 120_000, ebitda: 12_000, is_forecast: true },
          { year: lastFullYear + 4, revenue: 130_000, ebitda: 13_000, is_forecast: true },
          { year: lastFullYear + 5, revenue: 140_000, ebitda: 14_000, is_forecast: true },
          { year: lastFullYear + 6, revenue: 150_000, ebitda: 15_000, is_forecast: true },
        ],
      }),
      []
    )

    expect(expandedResult.projection_years).toBe(6)
  })

  it('serializes DCF autofill output as explicit forecast_years_data', () => {
    const lastFullYear = getCurrentFilingYear()
    const yearlyFinancials = applyDcfProjectionPreviewToForecastRows(
      [
        { year: String(lastFullYear - 1), revenue: 900_000, ebitda: 135_000 },
        { year: String(lastFullYear), revenue: 1_000_000, ebitda: 150_000 },
        { year: String(lastFullYear + 1), revenue: 0, ebitda: 0, isForecast: true },
        { year: String(lastFullYear + 2), revenue: 0, ebitda: 0, isForecast: true },
      ],
      deriveDcfProjectionPreview({
        yearlyFinancials: [
          { year: String(lastFullYear - 1), revenue: 900_000, ebitda: 135_000 },
          { year: String(lastFullYear), revenue: 1_000_000, ebitda: 150_000 },
        ],
        revenueGrowthPct: 10,
        ebitdaMarginPct: 20,
        forecastYears: [lastFullYear + 1, lastFullYear + 2],
      })
    )

    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: lastFullYear,
          revenue: 1_000_000,
          ebitda: 150_000,
        },
        historical_years_data: yearlyFinancials
          .filter((row) => !row.isForecast && Number(row.year) < lastFullYear)
          .map((row) => ({
            year: Number(row.year),
            revenue: row.revenue,
            ebitda: row.ebitda,
          })),
        forecast_years_data: yearlyFinancials.filter((row) => row.isForecast).map((row) => ({
          year: Number(row.year),
          revenue: row.revenue,
          ebitda: row.ebitda,
        })),
        dcf_revenue_growth_pct: 10,
        dcf_ebitda_margin_pct: 20,
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.forecast_years_data).toEqual([
      { year: lastFullYear + 1, revenue: 1_100_000, ebitda: 220_000, is_forecast: true },
      { year: lastFullYear + 2, revenue: 1_210_000, ebitda: 242_000, is_forecast: true },
    ])
  })

  it('preserves manual forecast edits after DCF autofill when building the request', () => {
    const lastFullYear = getCurrentFilingYear()
    const autofilledForecasts = applyDcfProjectionPreviewToForecastRows(
      [
        { year: String(lastFullYear), revenue: 1_000_000, ebitda: 150_000 },
        { year: String(lastFullYear + 1), revenue: 0, ebitda: 0, isForecast: true },
        { year: String(lastFullYear + 2), revenue: 0, ebitda: 0, isForecast: true },
      ],
      deriveDcfProjectionPreview({
        yearlyFinancials: [{ year: String(lastFullYear), revenue: 1_000_000, ebitda: 150_000 }],
        revenueGrowthPct: 10,
        ebitdaMarginPct: 20,
        forecastYears: [lastFullYear + 1, lastFullYear + 2],
      })
    )
      .filter((row) => row.isForecast)
      .map((row) =>
        Number(row.year) === lastFullYear + 2 ? { ...row, ebitda: 250_000 } : row
      )

    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: lastFullYear,
          revenue: 1_000_000,
          ebitda: 150_000,
        },
        forecast_years_data: autofilledForecasts.map((row) => ({
          year: Number(row.year),
          revenue: row.revenue,
          ebitda: row.ebitda,
        })),
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.forecast_years_data).toEqual([
      { year: lastFullYear + 1, revenue: 1_100_000, ebitda: 220_000, is_forecast: true },
      { year: lastFullYear + 2, revenue: 1_210_000, ebitda: 250_000, is_forecast: true },
    ])
  })

  it('forwards official Belgian filing trust context into the valuation request', () => {
    const result = buildValuationRequest(
      makeFormData({
        official_financials: {
          source: 'staatsbladmonitor',
          sourceLabel: 'NBB filing via Staatsbladmonitor',
          filingYear: 2024,
          revenue: 1_100_000,
          ebitda: 120_000,
          verificationBadge: {
            state: 'verified',
            label: 'Verified by NBB',
          },
          varianceAnalysis: {
            state: 'pending',
            explanationRequired: true,
          },
        },
        official_variance_analysis: {
          state: 'pending',
          explanationRequired: true,
        },
        official_verification_badge: {
          state: 'verified',
          label: 'Verified by NBB',
        },
      }),
      []
    )

    expect(result.official_financials).toMatchObject({
      source: 'staatsbladmonitor',
      sourceLabel: 'NBB filing via Staatsbladmonitor',
      filingYear: 2024,
      revenue: 1_100_000,
      ebitda: 120_000,
    })
    expect(result.official_variance_analysis).toEqual({
      state: 'pending',
      explanationRequired: true,
    })
    expect(result.official_verification_badge).toEqual({
      state: 'verified',
      label: 'Verified by NBB',
    })
  })

  // ─── Normalization integrity guard ─────────────────────────────────────────
  // Regression for the Metaalbewerking incident: visible normalizations in the
  // store with status !== 'accepted' would silently drop from the request, the
  // valuation would run on unnormalized EBITDA, and the seller would be
  // undervalued by ~€1M. The guard logs a warning so QA/telemetry catches it.
  it('logs an integrity warning when items are visible but none reach the request', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      [
        // Pending — would be displayed as a normalization but is NOT applied.
        {
          id: 'norm-pending-1',
          title: 'Owner compensation',
          rationale: 'Above-market owner salary',
          category: 'salary',
          type: 'add',
          value: 280_000,
          adjustment: 280_000,
          year: lastFullYear,
          status: 'pending',
          source: 'manual',
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    expect(result.current_year_data.ebitda).toBe(290_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && msg.includes('Normalization integrity guard')
    )
    expect(matched).toBeDefined()
    const ctx = matched?.[1] as Record<string, unknown> | undefined
    expect(ctx?.visible_count).toBe(1)
    expect(ctx?.visible_total_adjustment).toBe(280_000)

    warnSpy.mockRestore()
  })

  it('does not warn when at least one item is accepted', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      [
        {
          id: 'norm-accepted-1',
          title: 'Owner compensation',
          rationale: 'Above-market owner salary',
          category: 'salary',
          type: 'add',
          value: 280_000,
          adjustment: 280_000,
          year: lastFullYear,
          status: 'accepted',
          source: 'manual',
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    const matched = warnSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' && msg.includes('Normalization integrity guard')
    )
    expect(matched).toBeUndefined()

    warnSpy.mockRestore()
  })

  // ─── Orphan-year normalization guard ──────────────────────────────────────
  // Second flavor of the Metaalbewerking-class silent drop: an accepted
  // normalization targets a year that doesn't exist in current_year_data
  // OR historical_years_data. Without this guard the addback would be allocated
  // into normByYear[<missing year>] but never read by either request builder
  // — €280K would simply vanish from the calculation.
  it('logs and drops accepted normalizations whose target year is outside the data set', async () => {
    const loggerModule = await import('../logger')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    const lastFullYear = getCurrentFilingYear()
    const orphanYear = 1999 // intentionally outside the data set
    const result = buildValuationRequest(
      makeFormData({
        ebitda: 290_000,
        current_year_data: {
          year: lastFullYear,
          revenue: 1_950_000,
          ebitda: 290_000,
        },
      }),
      [
        {
          id: 'norm-orphan',
          title: 'Stale orphan addback',
          rationale: 'Targets a year that no longer exists',
          category: 'other',
          type: 'add',
          value: 280_000,
          adjustment: 280_000,
          year: orphanYear,
          applyAllYears: false,
          applyYears: [orphanYear],
          status: 'accepted',
          source: 'manual',
          confidence: 'medium',
          createdAt: new Date().toISOString(),
        },
      ]
    )

    // Current-year EBITDA must NOT have absorbed the orphan addback.
    expect(result.current_year_data.ebitda).toBe(290_000)
    expect(
      result.current_year_data.ebitda_normalization_metadata
    ).toBeUndefined()

    const matched = warnSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' &&
      msg.includes('Dropped accepted normalizations with no matching year')
    )
    expect(matched).toBeDefined()
    const ctx = matched?.[1] as Record<string, unknown> | undefined
    expect(ctx?.orphan_count).toBe(1)
    expect(ctx?.orphan_total_adjustment).toBe(280_000)
    expect(Array.isArray(ctx?.canonical_years)).toBe(true)

    warnSpy.mockRestore()
  })
})
