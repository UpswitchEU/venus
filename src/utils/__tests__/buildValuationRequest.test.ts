import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyDcfProjectionPreviewToForecastRows,
  deriveDcfProjectionPreview,
} from '../../components/calculator/sections/dcfProjectionPreview'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
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

  it('serializes Three Towers DCF inputs without adaptive/multiples contamination', () => {
    const filingYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        company_name: 'Three Towers Capital',
        country_code: 'BE',
        industry: 'services',
        business_model: 'services',
        revenue: 1_000_000,
        ebitda: 100_000,
        current_year_data: {
          year: filingYear,
          revenue: 1_000_000,
          ebitda: 100_000,
          cash: 20_000,
          total_debt: 0,
          total_equity: 400_000,
        },
        historical_years_data: [
          { year: filingYear - 1, revenue: 900_000, ebitda: 90_000 },
          { year: filingYear + 1, revenue: 1_050_000, ebitda: 120_000, is_forecast: true },
          { year: filingYear + 2, revenue: 1_100_000, ebitda: 130_000, is_forecast: true },
        ],
        dcf_wacc_pct: 10.5,
        dcf_terminal_growth_pct: 1.5,
        dcf_input_mode: 'ebitda',
      }),
      []
    )

    expect(result.current_year_data.cash).toBe(20_000)
    expect(result.current_year_data.total_debt).toBe(0)
    expect(result.current_year_data.total_equity).toBe(400_000)
    expect(result.historical_years_data.map((year) => year.year)).toEqual([filingYear - 1])
    expect(result.forecast_years_data).toHaveLength(2)
    expect(result.forecast_years_data.every((year) => year.is_forecast)).toBe(true)
    expect(result.business_context).toMatchObject({
      dcf_wacc_pct: 10.5,
      dcf_terminal_growth_pct: 1.5,
    })
    expect(result.projection_years).toBe(5)
    expect(result.use_dcf).toBe(true)
    expect(result.user_configured_dcf).toBe(true)
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
      buildValuationRequest(makeFormData({ owner_salary_addback: Number.NaN }), [])
        .owner_salary_addback
    ).toBeUndefined()
  })

  it('emits advanced advisor controls for included real estate, multiple calibration, weighting, and bridge display', () => {
    const result = buildValuationRequest(
      makeFormData({
        real_estate_treatment: 'included',
        real_estate_market_value: 900_000,
        real_estate_book_value: 650_000,
        estimated_market_rent: 42_000,
        multiple_calibration_adjustment: -1,
        multiple_calibration_note: '  Afslag wegens leveranciersafhankelijkheid  ',
        historical_ebitda_weighting_mode: 'weighted',
        historical_ebitda_weights: {
          [getCurrentFilingYear() - 3]: 10,
          [getCurrentFilingYear() - 2]: 30,
          [getCurrentFilingYear() - 1]: 60,
        },
        show_enterprise_to_equity_bridge: false,
      }),
      []
    )

    expect(result.real_estate_treatment).toBe('included')
    expect(result.exclude_real_estate).toBe(false)
    expect(result.real_estate_market_value).toBe(900_000)
    expect(result.real_estate_book_value).toBe(650_000)
    expect(result.estimated_market_rent).toBeUndefined()
    expect(result.multiple_calibration_adjustment).toBe(-1)
    expect(result.multiple_calibration_note).toBe('Afslag wegens leveranciersafhankelijkheid')
    expect(result.historical_ebitda_weighting_mode).toBe('weighted')
    expect(result.historical_ebitda_weights).toEqual({
      [getCurrentFilingYear() - 3]: 10,
      [getCurrentFilingYear() - 2]: 30,
      [getCurrentFilingYear() - 1]: 60,
    })
    expect(result.show_enterprise_to_equity_bridge).toBe(false)
  })

  it('maps the legacy real-estate carve-out toggle to the new transaction treatment', () => {
    const result = buildValuationRequest(
      makeFormData({
        exclude_real_estate: true,
        real_estate_book_value: 300_000,
        estimated_market_rent: 36_000,
      }),
      []
    )

    expect(result.real_estate_treatment).toBe('carve_out')
    expect(result.exclude_real_estate).toBe(true)
    expect(result.real_estate_book_value).toBe(300_000)
    expect(result.estimated_market_rent).toBe(36_000)
    expect(result.real_estate_market_value).toBeUndefined()
  })

  it('rejects multiple calibration adjustments without an audit note', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          multiple_calibration_adjustment: 0.5,
          multiple_calibration_note: '   ',
        }),
        []
      )
    ).toThrow('Calibration note is required')
  })

  it('rejects malformed historical EBITDA weights before calling the valuation engine', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          historical_ebitda_weighting_mode: 'weighted',
          historical_ebitda_weights: {
            [getCurrentFilingYear() - 2]: 40,
            [getCurrentFilingYear() - 1]: Number.NaN,
          },
        }),
        []
      )
    ).toThrow('Historical EBITDA weights must contain 3 to 5 fiscal years and sum to 100%.')
  })

  it('accepts fractional historical EBITDA weights that sum to one', () => {
    const result = buildValuationRequest(
      makeFormData({
        multiple_calibration_adjustment: 0.5,
        multiple_calibration_note: 'Opslag wegens hoge omzetkwaliteit',
        historical_ebitda_weighting_mode: 'weighted',
        historical_ebitda_weights: {
          [getCurrentFilingYear() - 3]: 0.1,
          [getCurrentFilingYear() - 2]: 0.3,
          [getCurrentFilingYear() - 1]: 0.6,
        },
      }),
      []
    )

    expect(result.multiple_calibration_adjustment).toBe(0.5)
    expect(result.multiple_calibration_note).toBe('Opslag wegens hoge omzetkwaliteit')
    expect(result.historical_ebitda_weighting_mode).toBe('weighted')
    expect(result.historical_ebitda_weights).toEqual({
      [getCurrentFilingYear() - 3]: 0.1,
      [getCurrentFilingYear() - 2]: 0.3,
      [getCurrentFilingYear() - 1]: 0.6,
    })
  })

  it('serializes adaptive DCF and NAV inputs into business_context', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'saas',
        dcf_revenue_growth_pct: 12,
        dcf_ebitda_margin_pct: 18,
        dcf_capex_pct: 4,
        dcf_da_pct: 3,
        dcf_nwc_pct: 4,
        dcf_tax_rate_pct: 25,
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 2,
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
      dcf_ebitda_margin_pct: 18,
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 4,
      dcf_tax_rate_pct: 25,
      dcf_wacc_pct: 9,
      dcf_terminal_growth_pct: 2,
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
        forecast_years_data: yearlyFinancials
          .filter((row) => row.isForecast)
          .map((row) => ({
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
      .map((row) => (Number(row.year) === lastFullYear + 2 ? { ...row, ebitda: 250_000 } : row))

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

    const matched = warnSpy.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('Normalization integrity guard')
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

    const matched = warnSpy.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('Normalization integrity guard')
    )
    expect(matched).toBeUndefined()

    warnSpy.mockRestore()
  })

  // ─── Orphan-year normalization guard (legacy store path) ─────────────────
  // ValuationForm still writes to useEbitdaNormalizationStore. A legacy
  // entry keyed by a year outside the canonical data set used to be
  // allocated into normByYear[<missing year>] and silently lost when the
  // current/historical builders ran. The guard now drops + logs them too.
  it('logs and drops legacy-store normalizations keyed by an orphan year', async () => {
    const loggerModule = await import('../logger')
    const ebitdaStoreModule = await import('../../store/useEbitdaNormalizationStore')
    const warnSpy = vi.spyOn(loggerModule.generalLogger, 'warn')

    // Inject a legacy entry directly — bypassing the openModal flow because
    // we just want to test the request builder's read-side handling.
    ebitdaStoreModule.useEbitdaNormalizationStore.setState({
      normalizations: {
        1999: {
          session_id: 'test',
          year: 1999,
          reported_ebitda: 0,
          adjustments: [
            {
              category: 'owner_compensation_adjustment' as any,
              amount: 280_000,
              note: 'orphan legacy',
            },
          ],
          custom_adjustments: [],
          total_adjustments: 280_000,
          confidence_score: 'medium',
          updated_at: new Date().toISOString(),
        } as any,
      },
    } as any)

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
      []
    )

    // Current-year EBITDA must NOT have absorbed the orphan legacy addback.
    expect(result.current_year_data.ebitda).toBe(290_000)
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(
      ([msg]) =>
        typeof msg === 'string' &&
        msg.includes('Dropped legacy normalization entries with no matching year')
    )
    expect(matched).toBeDefined()
    const ctx = matched?.[1] as Record<string, unknown> | undefined
    expect(ctx?.orphan_count).toBe(1)
    expect(ctx?.orphan_total_adjustment).toBe(280_000)

    // Cleanup so other tests don't see this fixture.
    ebitdaStoreModule.useEbitdaNormalizationStore.setState({
      normalizations: {},
    } as any)
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
    expect(result.current_year_data.ebitda_normalization_metadata).toBeUndefined()

    const matched = warnSpy.mock.calls.find(
      ([msg]) =>
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

  // -------------------------------------------------------------------
  // Capital history → cap_table + investment_amount_sought bridge
  //
  // Pins the Mercury → Titan boundary contract for the SaaS cap-table
  // feature.  The form-store carries `capital_*` fields (UI-only); the
  // builder must collapse them into the canonical `cap_table` summary
  // and the top-level `investment_amount_sought` field that Titan's
  // Zod schema validates and ValuationIQ's `calculate_arr_method`
  // consumes.  Empty / disabled inputs ⇒ neither field on the wire
  // (backwards compat).
  // -------------------------------------------------------------------

  describe('capital history bridge', () => {
    it('omits cap_table and investment_amount_sought when no capital fields are set', () => {
      const result = buildValuationRequest(makeFormData(), [])
      expect(result.cap_table).toBeUndefined()
      expect(result.investment_amount_sought).toBeUndefined()
    })

    it('maps capital_round_amount to top-level investment_amount_sought', () => {
      const result = buildValuationRequest(makeFormData({ capital_round_amount: 750_000 }), [])
      expect(result.investment_amount_sought).toBe(750_000)
      // No `capital_history_enabled` flag ⇒ no cap_table block.
      expect(result.cap_table).toBeUndefined()
    })

    it('builds cap_table with SAFEs + option pool + last-round when enabled', () => {
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: true,
          capital_round_amount: 500_000,
          capital_option_pool_pct: 12,
          capital_safe_notes: [
            {
              id: 'safe-1',
              amount: 100_000,
              valuation_cap: 5_000_000,
              discount_pct: 20,
              holder_label: 'Angel #1',
            },
            {
              id: 'safe-2',
              amount: 50_000,
            },
          ],
          capital_last_round_amount: 250_000,
          capital_last_round_post_money: 2_500_000,
          capital_last_round_date: '2024-06-15',
        }),
        []
      )

      expect(result.investment_amount_sought).toBe(500_000)
      expect(result.cap_table).toBeDefined()
      expect(result.cap_table?.option_pool_pct).toBe(12)
      expect(result.cap_table?.last_round_amount).toBe(250_000)
      expect(result.cap_table?.last_round_post_money).toBe(2_500_000)
      expect(result.cap_table?.last_round_date).toBe('2024-06-15')
      // SAFE notes: ids stripped, optional fields preserved when present.
      expect(result.cap_table?.safe_notes).toEqual([
        {
          amount: 100_000,
          valuation_cap: 5_000_000,
          discount_pct: 20,
          holder_label: 'Angel #1',
        },
        {
          amount: 50_000,
        },
      ])
    })

    it('drops SAFE notes whose amount is missing (incomplete row guard)', () => {
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: true,
          capital_option_pool_pct: 10,
          capital_safe_notes: [
            { id: 'safe-1', amount: 100_000 },
            { id: 'safe-2', amount: null }, // user added a row but didn't fill the amount
          ],
        }),
        []
      )
      expect(result.cap_table?.safe_notes).toHaveLength(1)
      expect(result.cap_table?.safe_notes?.[0]).toEqual({ amount: 100_000 })
    })

    it('omits cap_table when capital_history_enabled is false even with SAFEs persisted', () => {
      // The toggle is the gate — a founder who fills in SAFEs and then
      // toggles "no, first round" can keep their inputs in form-store
      // without the engine seeing them.  Same affordance as the deal-
      // structure section.
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: false,
          capital_safe_notes: [{ id: 'safe-1', amount: 100_000 }],
          capital_option_pool_pct: 10,
        }),
        []
      )
      expect(result.cap_table).toBeUndefined()
    })

    it('strips empty holder_label and skips invalid optional fields', () => {
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: true,
          capital_safe_notes: [
            {
              id: 'safe-1',
              amount: 100_000,
              valuation_cap: null,
              discount_pct: null,
              holder_label: '   ',
            },
          ],
        }),
        []
      )
      const note = result.cap_table?.safe_notes?.[0]
      expect(note).toBeDefined()
      expect(note).toEqual({ amount: 100_000 })
    })
  })

  describe('liquidation_inputs (Phase 2-4 advisor overrides)', () => {
    it('omits liquidation_inputs entirely when no liq_* field is set', () => {
      const result = buildValuationRequest(makeFormData(), [])
      // Empty dict would overwrite engine defaults with nothing on the
      // wire; unset is the right default so the valuation-iq orchestrator
      // treats it as "engine defaults" (Graydon/KPMG cohort).
      expect(result.liquidation_inputs).toBeUndefined()
    })

    it('bundles all 4 LiquidationInputsSection essentials + premise override', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 12,
          liq_monthly_rent: 8_500,
          liq_paid_up_capital: 250_000,
          liq_deferred_tax: 35_000,
          liq_premise_override: 'orderly_liquidation',
        } as unknown as Partial<ValuationFormData>),
        []
      )
      // Pinned for the audit 2026-05-10 wiring fix: liquidation_inputs
      // must survive the build → Titan Zod → legacy Pydantic → orchestrator
      // chain.  Field-name parity matches `calculate_liquidation_method`
      // kwargs verbatim — DO NOT rename without a coordinated migration.
      expect(result.liquidation_inputs).toEqual({
        headcount: 12,
        monthly_rent: 8_500,
        paid_up_capital: 250_000,
        deferred_tax_liabilities: 35_000,
        owner_premise_override: 'orderly_liquidation',
      })
    })

    it('coerces headcount to a non-negative integer', () => {
      const result = buildValuationRequest(
        makeFormData({
          // Decimal headcount is meaningless — must be floored to integer.
          liq_headcount: 7.8,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(result.liquidation_inputs?.headcount).toBe(7)
    })

    it('drops invalid premise override values silently', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 5,
          // typo / invalid string — must NOT propagate; engine would reject
          // an unknown premise enum.
          liq_premise_override: 'going_concern_typo',
        } as unknown as Partial<ValuationFormData>),
        []
      )
      // headcount still emits; premise_override is dropped.
      expect(result.liquidation_inputs?.headcount).toBe(5)
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.owner_premise_override
      ).toBeUndefined()
    })

    it('rejects going_concern as a premise (intentionally not exposed)', () => {
      // Liquidation analysis is in STANDALONE_METHODS — picking
      // going_concern would contradict the report's IVS 104 §80 premise.
      // Even if the form somehow emitted it, the build path must drop it.
      const result = buildValuationRequest(
        makeFormData({
          liq_premise_override: 'going_concern',
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(result.liquidation_inputs).toBeUndefined()
    })

    it('bundles per-tier liability buckets under liability_buckets', () => {
      // Pinned 2026-05-10: supplying explicit buckets is what flips
      // the cascade page from "estimated from jurisdiction defaults"
      // (engine warning) to a real EY/Big-4-grade waterfall.  Keys
      // map verbatim to `CascadeTierCode` on the engine side.
      const result = buildValuationRequest(
        makeFormData({
          liq_lb_estate_costs: 5_000,
          liq_lb_secured: 120_000,
          liq_lb_super_preferent_employees: 45_000,
          liq_lb_preferent_tax: 30_000,
          liq_lb_preferent_other: 10_000,
          liq_lb_unsecured: 200_000,
          liq_lb_subordinated: 25_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const inputs = result.liquidation_inputs as Record<string, unknown>
      expect(inputs).toBeDefined()
      expect(inputs.liability_buckets).toEqual({
        estate_costs: 5_000,
        secured: 120_000,
        super_preferent_employees: 45_000,
        preferent_tax: 30_000,
        preferent_other: 10_000,
        unsecured: 200_000,
        subordinated: 25_000,
      })
    })

    it('drops zero / negative liability bucket entries', () => {
      // Engine treats a missing tier as 0; a 0 input would still
      // surface the explicit-mode branch with a noisier wire.  Strip
      // them so the dict is minimal.
      const result = buildValuationRequest(
        makeFormData({
          liq_lb_secured: 0,
          liq_lb_unsecured: -100,
          liq_lb_preferent_tax: 50_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const buckets = (result.liquidation_inputs as Record<string, unknown>)
        ?.liability_buckets as Record<string, number>
      expect(buckets).toEqual({ preferent_tax: 50_000 })
    })

    it('omits liability_buckets when no tier is supplied', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 5,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      // Engine defaults fire; the wire stays clean.
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.liability_buckets
      ).toBeUndefined()
    })

    it('bundles asset_overrides per class as nested {adjusted_value} dicts', () => {
      // Engine expects asset_overrides keyed by `AssetClass.value`,
      // each entry a dict with optional `adjusted_value` /
      // `orderly_recovery_factor` / etc.  Venus only surfaces
      // `adjusted_value` today.
      const result = buildValuationRequest(
        makeFormData({
          liq_ao_machinery_equipment: 120_000,
          liq_ao_buildings: 500_000,
          liq_ao_intangibles: 25_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const inputs = result.liquidation_inputs as Record<string, unknown>
      expect(inputs.asset_overrides).toEqual({
        machinery_equipment: { adjusted_value: 120_000 },
        buildings: { adjusted_value: 500_000 },
        intangibles: { adjusted_value: 25_000 },
      })
    })

    it('drops zero / negative asset overrides', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_ao_cash: 0,
          liq_ao_land: -1000,
          liq_ao_vehicles: 15_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect((result.liquidation_inputs as Record<string, unknown>)?.asset_overrides).toEqual({
        vehicles: { adjusted_value: 15_000 },
      })
    })

    it('omits asset_overrides when no class is overridden', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 5,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.asset_overrides
      ).toBeUndefined()
    })

    it('forwards realised_capital_gains when positive (BE meerwaarde / NL Vpb-14a base)', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_realised_capital_gains: 150_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect((result.liquidation_inputs as Record<string, unknown>)?.realised_capital_gains).toBe(
        150_000
      )
    })

    it('drops realised_capital_gains when zero or negative', () => {
      // Engine treats 0 as "no gains"; emitting 0 explicitly is
      // noise on the wire.
      const result = buildValuationRequest(
        makeFormData({
          liq_realised_capital_gains: 0,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.realised_capital_gains
      ).toBeUndefined()
    })

    it('forwards runway_months_forced + distress_wacc_forced (forced-scenario inputs)', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_runway_months_forced: 4,
          liq_distress_wacc_forced: 0.3,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const inputs = result.liquidation_inputs as Record<string, unknown>
      expect(inputs.runway_months_forced).toBe(4)
      expect(inputs.distress_wacc_forced).toBe(0.3)
    })

    it('floors runway_months_forced to a positive integer', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_runway_months_forced: 4.7,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect((result.liquidation_inputs as Record<string, unknown>)?.runway_months_forced).toBe(4)
    })

    it('forwards identifiable_intangibles_uplift_pct as a decimal', () => {
      // Stored as decimal (0.20 = 20%); engine accepts the decimal form.
      const result = buildValuationRequest(
        makeFormData({
          liq_intangibles_uplift_pct: 0.2,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.identifiable_intangibles_uplift_pct
      ).toBe(0.2)
    })
  })

  describe('fiscal_inputs (meerwaardebelasting / Art. 90 WIB 92)', () => {
    // The data rail captures only the four amount values for the
    // cedent's 31/12/2025 cost-basis filing. Advisory metadata
    // (peildatum, company role, EBITDA basis, internal-transfer flag,
    // anchors-acknowledged attestation) is auto-derived by the report
    // builder OR set on `request.metadata` via firm/transaction settings
    // — never collected on the data rail. See FiscalInputsSection.tsx
    // header comment for the rail / metadata split.
    type RequestWithFiscal = ReturnType<typeof buildValuationRequest> & {
      fiscal_inputs?: Record<string, unknown>
    }

    it('omits fiscal_inputs entirely when no fiscal_* field is set', () => {
      const result = buildValuationRequest(makeFormData(), []) as RequestWithFiscal
      // Empty dict would be wire noise; unset is the right default so
      // the aggregator treats the run as "engine defaults".
      expect(result.fiscal_inputs).toBeUndefined()
    })

    it('emits the four amount keys when populated', () => {
      const result = buildValuationRequest(
        makeFormData({
          fiscal_acquisition_cost: 850_000,
          fiscal_anchor_2_value: 900_000,
          fiscal_anchor_3_value: 1_100_000,
          fiscal_anchor_4_value: 1_050_000,
        }),
        []
      ) as RequestWithFiscal

      expect(result.fiscal_inputs).toEqual({
        acquisition_cost: 850_000,
        anchor_2_value: 900_000,
        anchor_3_value: 1_100_000,
        anchor_4_value: 1_050_000,
      })
    })

    it('emits a partial dict when only some anchors are filled', () => {
      const result = buildValuationRequest(
        makeFormData({
          fiscal_acquisition_cost: 500_000,
          fiscal_anchor_3_value: 600_000,
        }),
        []
      ) as RequestWithFiscal

      expect(result.fiscal_inputs).toEqual({
        acquisition_cost: 500_000,
        anchor_3_value: 600_000,
      })
    })

    it('coerces numeric values and skips non-finite ones', () => {
      const result = buildValuationRequest(
        makeFormData({
          // @ts-expect-error — runtime guard against legacy stringly-typed values
          fiscal_anchor_2_value: '750000',
          // @ts-expect-error — NaN should be dropped, not propagated
          fiscal_anchor_3_value: Number.NaN,
          fiscal_anchor_4_value: 0,
        }),
        []
      ) as RequestWithFiscal

      expect(result.fiscal_inputs?.anchor_2_value).toBe(750_000)
      expect(result.fiscal_inputs?.anchor_3_value).toBeUndefined()
      // 0 is a legitimate value (a contract formula can yield zero); preserve it.
      expect(result.fiscal_inputs?.anchor_4_value).toBe(0)
    })
  })
})
