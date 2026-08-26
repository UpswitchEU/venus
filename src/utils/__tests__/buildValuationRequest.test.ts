import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { buildValuationRequest } from '../buildValuationRequest'
import { getCurrentFilingYear } from '../fiscalYear'
import { getCompleteYearlyFinancialsDesc } from '../yearlyFinancials'
import { makeFormData } from './buildValuationRequest.testUtils'

describe('buildValuationRequest core registry and financial contract', () => {
  afterEach(() => {
    vi.useRealTimers()
    useTaxLatencyStore.getState().clear()
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

  it('forwards registry identity fields into the valuation request', () => {
    const result = buildValuationRequest(
      makeFormData({
        kbo_number: ' 1007.696.970 ',
        vat_number: ' BE1007696970 ',
        legal_form: ' Vennootschap onder firma ',
        postal_code: '8531',
        city: 'Harelbeke',
      }),
      []
    )

    expect(result).toMatchObject({
      registration_number: '1007.696.970',
      kbo_number: '1007.696.970',
      vat_number: 'BE1007696970',
      legal_form: 'Vennootschap onder firma',
      postal_code: '8531',
      city: 'Harelbeke',
    })
  })

  it('forwards registry identity fields from business_context aliases', () => {
    const result = buildValuationRequest(
      makeFormData({
        kbo_number: undefined,
        registration_number: undefined,
        legal_form: undefined,
        postal_code: undefined,
        city: undefined,
        business_context: {
          kbo_registration_number: ' 1007.696.970 ',
          legal_form: ' Vennootschap onder firma ',
          vat_number: ' BE1007696970 ',
          postal_code: '8531',
          city: 'Harelbeke',
        },
      }),
      []
    )

    expect(result).toMatchObject({
      registration_number: '1007.696.970',
      kbo_number: '1007.696.970',
      vat_number: 'BE1007696970',
      legal_form: 'Vennootschap onder firma',
      postal_code: '8531',
      city: 'Harelbeke',
    })
  })

  it('prefers selected-company registry context over stale top-level identifiers', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'BE',
        registration_number: '0773.520.560',
        kbo_number: '0773.520.560',
        kvk_number: '12345678',
        legal_form: 'Commanditaire vennootschap',
        postal_code: '1000',
        city: 'Brussel',
        business_context: {
          kbo_registration_number: '1033.441.760',
          kbo_registration: '1033.441.760',
          company_id: '1033.441.760',
          legal_form: 'Besloten Vennootschap',
          company_address: '9050 Gent',
        },
      }),
      []
    )

    expect(result.registration_number).toBe('1033.441.760')
    expect(result.kbo_number).toBe('1033.441.760')
    expect(result.kvk_number).toBeUndefined()
    expect(result.legal_form).toBe('Besloten Vennootschap')
    expect(result.postal_code).toBe('9050')
    expect(result.city).toBe('Gent')
  })

  it('uses selected-company company_id as registry fallback before stale top-level fields', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'BE',
        registration_number: '0773.520.560',
        kbo_number: '0773.520.560',
        legal_form: 'Commanditaire vennootschap',
        postal_code: '1000',
        city: 'Brussel',
        business_context: {
          company_id: '1033.441.760',
          legal_form: 'Besloten Vennootschap',
          company_address: '9050 Gent',
        },
      }),
      []
    )

    expect(result.registration_number).toBe('1033.441.760')
    expect(result.kbo_number).toBe('1033.441.760')
    expect(result.legal_form).toBe('Besloten Vennootschap')
    expect(result.postal_code).toBe('9050')
    expect(result.city).toBe('Gent')
  })

  it('accepts camelCase selected-company businessContext aliases', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'BE',
        registration_number: '0773.520.560',
        kbo_number: '0773.520.560',
        legal_form: 'Commanditaire vennootschap',
        postal_code: '1000',
        city: 'Brussel',
        business_context: {
          kboNumber: '1033.441.760',
          legalForm: 'Besloten Vennootschap',
          vatNumber: 'BE1033441760',
          companyAddress: '9050 Gent',
        },
      }),
      []
    )

    expect(result.registration_number).toBe('1033.441.760')
    expect(result.kbo_number).toBe('1033.441.760')
    expect(result.legal_form).toBe('Besloten Vennootschap')
    expect(result.vat_number).toBe('BE1033441760')
    expect(result.postal_code).toBe('9050')
    expect(result.city).toBe('Gent')
  })

  it('accepts enterprise number aliases from selected-company context', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'BE',
        registration_number: '0773.520.560',
        kbo_number: '0773.520.560',
        business_context: {
          enterpriseNumber: '1033.441.760',
          legalForm: 'Besloten Vennootschap',
          companyAddress: '9050 Gent',
        },
      }),
      []
    )

    expect(result.registration_number).toBe('1033.441.760')
    expect(result.kbo_number).toBe('1033.441.760')
    expect(result.legal_form).toBe('Besloten Vennootschap')
    expect(result.postal_code).toBe('9050')
    expect(result.city).toBe('Gent')
  })

  it('maps business_context registry aliases to KVK fields for Dutch companies', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'NL',
        kbo_number: '0773.520.560',
        kvk_number: undefined,
        registration_number: '0773.520.560',
        business_context: {
          kbo_registration_number: ' 12345678 ',
          legal_form: ' Vennootschap onder firma ',
          company_city: 'Amsterdam',
        },
      }),
      []
    )

    expect(result.registration_number).toBe('12345678')
    expect(result.kvk_number).toBe('12345678')
    expect(result.kbo_number).toBeUndefined()
    expect(result.legal_form).toBe('Vennootschap onder firma')
    expect(result.city).toBe('Amsterdam')
  })

  it('derives Belgian postal code and city from selected company address fallback', () => {
    const result = buildValuationRequest(
      makeFormData({
        postal_code: undefined,
        city: undefined,
        business_context: {
          company_address: '8531 Harelbeke,',
        },
      }),
      []
    )

    expect(result.postal_code).toBe('8531')
    expect(result.city).toBe('Harelbeke')
  })

  it('derives Dutch postcode and city from selected company address fallback', () => {
    const result = buildValuationRequest(
      makeFormData({
        country_code: 'NL',
        postal_code: undefined,
        city: undefined,
        business_context: {
          company_address: '1012AB Amsterdam',
        },
      }),
      []
    )

    expect(result.postal_code).toBe('1012 AB')
    expect(result.city).toBe('Amsterdam')
  })

  it('keeps explicit postal code and city ahead of parsed address fallback', () => {
    const result = buildValuationRequest(
      makeFormData({
        postal_code: '8531',
        city: 'Harelbeke',
        business_context: {
          company_address: '9999 Anderlecht,',
        },
      }),
      []
    )

    expect(result.postal_code).toBe('8531')
    expect(result.city).toBe('Harelbeke')
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
      {
        year: lastFullYear - 1,
        revenue: 900_000,
        ebitda: 90_000,
        reported_ebitda: 90_000,
        ebitda_normalized: false,
      },
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
        user_weights: { dcf: 70, ebitda_multiple: 30 },
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

  it('keeps DCF available as a candidate when Adaptive is selected', () => {
    const filingYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        selected_method: 'upswitch_adaptive',
        current_year_data: {
          year: filingYear,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [{ year: filingYear - 1, revenue: 900_000, ebitda: 100_000 }],
      }),
      []
    )

    expect(result.selected_method).toBe('upswitch_adaptive')
    expect(result.use_dcf).toBe(true)
    expect(result.use_multiples).toBe(true)
  })

  it('serializes Henk-style FCFF-only DCF inputs with year-end discounting', () => {
    const filingYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        company_name: 'Henk DCF Template BV',
        country_code: 'NL',
        current_year_data: {
          year: filingYear,
          revenue: 1_000,
          ebitda: 300,
          cash: 200,
          total_debt: 100,
          total_equity: 700,
        },
        historical_years_data: [{ year: filingYear - 1, revenue: 900, ebitda: 270 }],
        forecast_years_data: [
          { year: filingYear + 1, revenue: 0, ebitda: 0, free_cash_flow: 202.5 },
          { year: filingYear + 2, revenue: 0, ebitda: 0, free_cash_flow: 227.5 },
          { year: filingYear + 3, revenue: 0, ebitda: 0, free_cash_flow: 247.5 },
          { year: filingYear + 4, revenue: 0, ebitda: 0, free_cash_flow: 236.25 },
          { year: filingYear + 5, revenue: 0, ebitda: 0, free_cash_flow: 245.2125 },
        ],
        dcf_input_mode: 'fcff_only',
        dcf_wacc_pct: 17.5,
        dcf_terminal_growth_pct: 1,
        dcf_discounting_convention: 'year_end',
        dcf_tax_shield_projections: [1.5, 1.125, 0.75, 0.375, 0],
      }),
      []
    )

    expect(result.dcf_input_mode).toBe('fcff_only')
    expect(result.forecast_years_data?.map((year) => year.free_cash_flow)).toEqual([
      202.5, 227.5, 247.5, 236.25, 245.2125,
    ])
    expect(result.forecast_years_data?.every((year) => year.is_forecast)).toBe(true)
    expect(result.business_context).toMatchObject({
      dcf_wacc_pct: 17.5,
      dcf_terminal_growth_pct: 1,
      dcf_discounting_convention: 'year_end',
      dcf_tax_shield_projections: [1.5, 1.125, 0.75, 0.375, 0],
      dcf_input_mode: 'fcff_only',
      apv_input_source: 'manual',
      dcf_tax_shield_source: 'manual',
      dcf_bridge_policy: 'apv_tax_shield_inside_dcf',
      dcf_double_counting_guard: true,
      dcf_benchmark_case: 'henk_customer_dcf_template',
    })
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

  it('preserves explicit shares_for_sale and defaults to 100 when absent', () => {
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

    expect(decimalResult.shares_for_sale).toBe(33.33)
    expect(zeroResult.shares_for_sale).toBe(0)
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
        status: 'accepted',
        evidence_id: 'evidence-property-tax-1',
        reviewed_at: '2026-08-12T09:30:00Z',
        rule_version: 'equity-bridge-v1',
        approved_by: 'advisor-17',
        currency: 'EUR',
        fiscal_year: 2025,
        effective_date: '2025-12-31',
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
        status: 'accepted',
        evidence_id: 'evidence-property-tax-1',
        reviewed_at: '2026-08-12T09:30:00Z',
        rule_version: 'equity-bridge-v1',
        approved_by: 'advisor-17',
        currency: 'EUR',
        fiscal_year: 2025,
        effective_date: '2025-12-31',
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
      {
        year: 2023,
        revenue: 1_000_000,
        ebitda: 100_000,
        reported_ebitda: 100_000,
        ebitda_normalized: false,
      },
    ])
  })

  it('uses populated current-year accounting data when stale top-level mirrors remain zero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'))

    const result = buildValuationRequest(
      makeFormData({
        company_name: 'LGS workshop',
        revenue: 0,
        ebitda: 0,
        current_year_data: {
          year: 2025,
          revenue: 11_282_327,
          ebitda: 1_205_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 11_282_327, ebitda: 1_115_950 },
          { year: 2023, revenue: 11_282_327, ebitda: 1_045_723 },
        ],
      }),
      []
    )

    expect(result.current_year_data).toMatchObject({
      year: 2025,
      revenue: 11_282_327,
      ebitda: 1_205_000,
    })
    expect(result.historical_years_data.map((row) => row.year)).toEqual([2023, 2024])
  })

  it('preserves zero-revenue historical rows when they carry earnings evidence', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [{ year: lastFullYear - 1, revenue: 0, ebitda: 90_000 }],
      }),
      []
    )

    expect(result.historical_years_data).toEqual([
      expect.objectContaining({ year: lastFullYear - 1, revenue: 0, ebitda: 90_000 }),
    ])
  })

  it('preserves asset-only holding history with explicit zero revenue and EBITDA', () => {
    const lastFullYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'holding-company',
        historical_years_data: [
          {
            year: lastFullYear - 1,
            revenue: 0,
            ebitda: 0,
            total_assets: 2_500_000,
            total_liabilities: 900_000,
            total_equity: 1_600_000,
          },
        ],
      }),
      []
    )

    expect(result.historical_years_data).toEqual([
      expect.objectContaining({
        year: lastFullYear - 1,
        revenue: 0,
        ebitda: 0,
        total_assets: 2_500_000,
        total_equity: 1_600_000,
      }),
    ])
  })

  it('builds the Upswitch one-year valuation payload without zero-revenue historical rows', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00Z'))

    const result = buildValuationRequest(
      makeFormData({
        company_name: 'Upswitch',
        country_code: 'BE',
        industry: 'Financial Services',
        business_model: 'Fintech - Lending & Credit',
        business_type: 'company',
        business_type_id: 'fintech-lending-credit',
        kbo_number: '1033.441.760',
        legal_form: 'Besloten Vennootschap',
        postal_code: '9050',
        city: 'Gent',
        number_of_owners: 1,
        number_of_employees: 5,
        revenue: 1_000_000,
        ebitda: 100_000,
        current_year_data: {
          year: 2025,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 0, ebitda: 0 },
          { year: 2023, revenue: 0, ebitda: 0 },
        ],
      }),
      []
    )

    expect(result).toMatchObject({
      company_name: 'Upswitch',
      country_code: 'BE',
      industry: 'Financial Services',
      business_model: 'Fintech - Lending & Credit',
      registration_number: '1033.441.760',
      kbo_number: '1033.441.760',
      legal_form: 'Besloten Vennootschap',
      postal_code: '9050',
      city: 'Gent',
      number_of_owners: 1,
      number_of_employees: 5,
      business_type_id: 'fintech-lending',
      current_year_data: {
        year: 2025,
        revenue: 1_000_000,
        ebitda: 100_000,
      },
    })
    expect(result.historical_years_data).toEqual([])
  })
})
