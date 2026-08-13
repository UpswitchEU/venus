import { describe, expect, it } from 'vitest'
import {
  applyDcfProjectionPreviewToForecastRows,
  deriveDcfProjectionPreview,
} from '../../components/calculator/sections/dcfProjectionPreview'
import type { ValuationFormData } from '../../types/valuation'
import { buildValuationRequest } from '../buildValuationRequest'
import { getCurrentFilingYear } from '../fiscalYear'
import { makeFormData } from './buildValuationRequest.testUtils'

describe('buildValuationRequest advisor controls and DCF contract', () => {
  it('forwards direct WACC evidence and preserves unresolved completion-account nulls', () => {
    const waccEvidence = {
      schema_version: 'wacc_evidence.v1' as const,
      mode: 'direct_sector_wacc' as const,
      value_pct: 12.2,
      range_low_pct: 11.4,
      range_high_pct: 13,
      period: '2026-07',
      source_type: 'published_sector_wacc_series',
      source_url: 'https://evaluation-data.pwc.be/healthcare-pharmaceuticals/',
      content_sha256: 'c'.repeat(64),
      chart_locator: 'Healthcare & Pharmaceuticals — July 2026',
      methodology: 'Published all-in sector WACC including its stated size premium.',
      reviewer: 'Upswitch valuation committee',
      reviewed_at: '2026-08-13T12:00:00Z',
      includes_size_premium: true as const,
    }
    const result = buildValuationRequest(
      makeFormData({
        wacc_evidence_contract: waccEvidence,
        restricted_cash: null,
        lease_liabilities: null,
        debt_like_items: null,
        normalized_nwc_target: null,
      }),
      []
    )

    expect(result.wacc_evidence_contract).toEqual(waccEvidence)
    expect(result).toMatchObject({
      restricted_cash: null,
      lease_liabilities: null,
      debt_like_items: null,
      normalized_nwc_target: null,
    })
  })

  it('keeps the untrusted fallback disabled by default', () => {
    const result = buildValuationRequest(makeFormData({}), [])
    expect(result.allow_untrusted_multiples_fallback).toBeUndefined()
    expect(result.untrusted_multiples_fallback_reason).toBeUndefined()
  })

  it('requires and forwards the advisor fallback rationale and EV headline basis', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({ allow_untrusted_multiples_fallback: true }),
        []
      )
    ).toThrow('written advisor rationale is required')

    const result = buildValuationRequest(
      makeFormData({
        allow_untrusted_multiples_fallback: true,
        untrusted_multiples_fallback_reason: '  No resolved pharmacy × BE contract.  ',
        headline_value_basis: 'enterprise_value',
        use_dcf: false,
        use_multiples: true,
      }),
      []
    )

    expect(result).toMatchObject({
      allow_untrusted_multiples_fallback: true,
      untrusted_multiples_fallback_reason: 'No resolved pharmacy × BE contract.',
      headline_value_basis: 'enterprise_value',
      use_dcf: false,
      use_multiples: true,
    })
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
        effective_multiple_override: 6,
        effective_multiple_override_note: '  Strategische koper-premie bevestigd  ',
        multiple_type_weights: {
          ev_ebitda: 50,
          ev_revenue: 40,
          pe: 10,
        },
        advisor_discount_weights: {
          size_discount: 0,
          liquidity_discount: 1.25,
          country_adjustment: 2,
          growth_premium: 0.75,
        },
        risk_analysis_enabled: false,
        discount_floor_factor: 0.4,
        historical_years_data: [
          { year: getCurrentFilingYear() - 3, revenue: 700_000, ebitda: 70_000 },
          { year: getCurrentFilingYear() - 2, revenue: 800_000, ebitda: 80_000 },
          { year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 90_000 },
        ],
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
    expect(result.effective_multiple_override).toBe(6)
    expect(result.effective_multiple_override_note).toBe('Strategische koper-premie bevestigd')
    expect(result.multiple_type_weights).toEqual({
      ev_ebitda: 50,
      ev_revenue: 40,
      pe: 10,
    })
    expect(result.advisor_discount_weights).toEqual({
      size_discount: 0,
      liquidity_discount: 1.25,
      country_adjustment: 2,
      growth_premium: 0.75,
    })
    expect(result.risk_analysis_enabled).toBe(false)
    expect(result.discount_floor_factor).toBe(0.4)
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

  it('rejects included real estate without market and book values', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          real_estate_treatment: 'included',
          real_estate_market_value: Number.NaN,
          real_estate_book_value: 650_000,
        }),
        []
      )
    ).toThrow('Market value of real estate is required')

    expect(() =>
      buildValuationRequest(
        makeFormData({
          real_estate_treatment: 'included',
          real_estate_market_value: 900_000,
        }),
        []
      )
    ).toThrow('Book value of real estate is required')
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

  it('rejects multiple calibration adjustments outside the engine-supported range', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          multiple_calibration_adjustment: 10.1,
          multiple_calibration_note: 'Opslag buiten bandbreedte',
        }),
        []
      )
    ).toThrow('Specific risk/quality premium must be between -10.0x and +10.0x.')

    expect(() =>
      buildValuationRequest(
        makeFormData({
          multiple_calibration_adjustment: -10.1,
          multiple_calibration_note: 'Afslag buiten bandbreedte',
        }),
        []
      )
    ).toThrow('Specific risk/quality premium must be between -10.0x and +10.0x.')
  })

  it('rejects final effective multiple overrides without an audit note', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          effective_multiple_override: 6,
          effective_multiple_override_note: '   ',
        }),
        []
      )
    ).toThrow('Effective multiple override note is required')
  })

  it('rejects final effective multiple overrides outside the engine-supported range', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          effective_multiple_override: 0,
          effective_multiple_override_note: 'Te laag',
        }),
        []
      )
    ).toThrow('Effective multiple override must be greater than 0.0x')

    expect(() =>
      buildValuationRequest(
        makeFormData({
          effective_multiple_override: 50.1,
          effective_multiple_override_note: 'Te hoog',
        }),
        []
      )
    ).toThrow('Effective multiple override must be greater than 0.0x')
  })

  it('rejects advisor discount controls outside the engine-supported range', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          advisor_discount_weights: {
            size_discount: 2.1,
          },
        }),
        []
      )
    ).toThrow('Advisor discount influence must be between 0.00x and 2.00x.')

    expect(() =>
      buildValuationRequest(
        makeFormData({
          discount_floor_factor: -0.05,
        }),
        []
      )
    ).toThrow('Discount stack floor must be between 0% and 100%.')
  })

  it('normalizes ratio-style multiple-type blend weights to percentages', () => {
    const result = buildValuationRequest(
      makeFormData({
        multiple_type_weights: {
          ev_ebitda: 0.5,
          ev_revenue: 0.4,
          pe: 0.1,
        },
      }),
      []
    )

    expect(result.multiple_type_weights).toEqual({
      ev_ebitda: 50,
      ev_revenue: 40,
      pe: 10,
    })
  })

  it('rejects malformed multiple-type blend weights before calling the valuation engine', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          multiple_type_weights: {
            ev_ebitda: 60,
            ev_revenue: 20,
          },
        }),
        []
      )
    ).toThrow('Multiple-type blend weights must sum to 100%.')

    expect(() =>
      buildValuationRequest(
        makeFormData({
          multiple_type_weights: {
            ev_ebitda: 101,
          },
        }),
        []
      )
    ).toThrow('Multiple-type blend weights must be between 0% and 100%.')
  })

  it('falls back to standard weighting when historical EBITDA weights are malformed (no throw)', () => {
    // Graceful fallback, not a hard error: an advisor whose saved default is
    // 'weighted' but carries no/partial weights must still get a valuation.
    const result = buildValuationRequest(
      makeFormData({
        historical_ebitda_weighting_mode: 'weighted',
        historical_ebitda_weights: {
          [getCurrentFilingYear() - 2]: 40,
          [getCurrentFilingYear() - 1]: Number.NaN,
        },
      }),
      []
    )

    expect(result.historical_ebitda_weighting_mode).toBe('standard')
    expect(result.historical_ebitda_weights).toBeUndefined()
  })

  it('prunes per-year weights for years absent from the financials (no stale keys reach the engine)', () => {
    // The advisor weighted 3 years, then removed one from the financials. The stale
    // weight for the dropped year must not be sent; the surviving 2-year set is no
    // longer valid (<3 years) so we fall back to standard.
    const result = buildValuationRequest(
      makeFormData({
        historical_years_data: [
          { year: getCurrentFilingYear() - 2, revenue: 800_000, ebitda: 80_000 },
          { year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 90_000 },
        ],
        historical_ebitda_weighting_mode: 'weighted',
        historical_ebitda_weights: {
          [getCurrentFilingYear() - 3]: 17, // stale: no financial row for this year
          [getCurrentFilingYear() - 2]: 33,
          [getCurrentFilingYear() - 1]: 50,
        },
      }),
      []
    )

    expect(result.historical_ebitda_weighting_mode).toBe('standard')
    expect(result.historical_ebitda_weights).toBeUndefined()
  })

  it('accepts fractional historical EBITDA weights that sum to one', () => {
    const result = buildValuationRequest(
      makeFormData({
        multiple_calibration_adjustment: 0.5,
        multiple_calibration_note: 'Opslag wegens hoge omzetkwaliteit',
        historical_years_data: [
          { year: getCurrentFilingYear() - 3, revenue: 700_000, ebitda: 70_000 },
          { year: getCurrentFilingYear() - 2, revenue: 800_000, ebitda: 80_000 },
          { year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 90_000 },
        ],
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

  it('normalizes restored string bridge toggles without truthy string coercion', () => {
    const result = buildValuationRequest(
      makeFormData({
        show_enterprise_to_equity_bridge: 'false',
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.show_enterprise_to_equity_bridge).toBe(false)
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
        dcf_terminal_value_method: 'perpetual_growth',
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
      business_type_id: 'saas',
      dcf_revenue_growth_pct: 12,
      dcf_ebitda_margin_pct: 18,
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 4,
      dcf_tax_rate_pct: 25,
      dcf_wacc_pct: 9,
      dcf_terminal_growth_pct: 2,
      dcf_terminal_value_method: 'perpetual_growth',
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
    expect(result.business_context?.forward_driver_evidence).toMatchObject({
      schema_version: 'forward_driver_evidence_v1',
      dcf_assumptions: expect.arrayContaining([
        expect.objectContaining({
          field_key: 'dcf_wacc_pct',
          driver_group: 'wacc',
          value: 9,
          source_kind: 'system_fallback',
        }),
        expect.objectContaining({
          field_key: 'dcf_debt_equity_pct',
          driver_group: 'wacc',
          value: 30,
        }),
        expect.objectContaining({
          field_key: 'terminal_value_assumption',
          driver_group: 'terminal_value_assumption',
        }),
      ]),
    })
    expect(result.business_context?.dcf_exit_multiple).toBeUndefined()
  })

  it('serializes only the exit multiple for DCF exit-multiple terminal value', () => {
    const result = buildValuationRequest(
      makeFormData({
        business_type_id: 'saas',
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 2,
        dcf_terminal_value_method: 'exit_multiple',
        dcf_exit_multiple: 6,
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.business_context).toMatchObject({
      business_type_id: 'saas',
      dcf_wacc_pct: 9,
      dcf_terminal_value_method: 'exit_multiple',
      dcf_exit_multiple: 6,
    })
    expect(result.business_context?.dcf_terminal_growth_pct).toBeUndefined()
  })

  it('rejects perpetual-growth DCF terminal assumptions when terminal growth is not below WACC', () => {
    expect(() =>
      buildValuationRequest(
        makeFormData({
          business_type_id: 'saas',
          selected_method: 'dcf',
          dcf_wacc_pct: 2,
          dcf_terminal_growth_pct: 2,
          dcf_terminal_value_method: 'perpetual_growth',
        } as Partial<ValuationFormData>),
        []
      )
    ).toThrow('Terminal growth must be lower than WACC')
  })

  it('aligns APV tax-shield projections to the forecast-year horizon without shifting values', () => {
    const filingYear = getCurrentFilingYear()
    const result = buildValuationRequest(
      makeFormData({
        selected_method: 'dcf',
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 2,
        dcf_tax_shield_projections: [1500, 'bad' as unknown as number, 750, 999],
        forecast_years_data: [
          { year: filingYear + 1, revenue: 1_050_000, ebitda: 105_000 },
          { year: filingYear + 2, revenue: 1_100_000, ebitda: 110_000 },
          { year: filingYear + 3, revenue: 1_155_000, ebitda: 115_500 },
        ],
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.business_context).toMatchObject({
      dcf_tax_shield_projections: [1500, 0, 750],
      apv_input_source: 'manual',
      dcf_tax_shield_source: 'manual',
      dcf_bridge_policy: 'apv_tax_shield_inside_dcf',
      dcf_double_counting_guard: true,
    })
    expect(result.forecast_years_data).toHaveLength(3)
    expect(result.user_configured_dcf).toBe(true)
  })

  it('pads APV tax-shield projections to the default DCF horizon when forecast rows are absent', () => {
    const result = buildValuationRequest(
      makeFormData({
        selected_method: 'dcf',
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 2,
        dcf_tax_shield_projections: [1500, 750],
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.projection_years).toBe(5)
    expect(result.forecast_years_data).toEqual([])
    expect(result.business_context).toMatchObject({
      dcf_tax_shield_projections: [1500, 750, 0, 0, 0],
      apv_input_source: 'manual',
      dcf_double_counting_guard: true,
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

  it('prefers repaired yearlyFinancials forecast rows over stale explicit forecast_years_data', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: 2025,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 900_000, ebitda: 90_000 },
          { year: 2023, revenue: 800_000, ebitda: 80_000 },
        ],
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          { year: '2024', revenue: 900_000, ebitda: 90_000 },
          { year: '2023', revenue: 800_000, ebitda: 80_000 },
          {
            year: '2026',
            revenue: 1_050_000,
            ebitda: 105_000,
            capex: 21_000,
            depreciation: 21_000,
            nwc_change: 750,
            isForecast: true,
          },
        ],
        forecast_years_data: [{ year: 2026, revenue: 105_000, ebitda: 0 }],
        dcf_revenue_growth_pct: 5,
        dcf_ebitda_margin_pct: 10,
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.forecast_years_data).toEqual([
      {
        year: 2026,
        revenue: 1_050_000,
        ebitda: 105_000,
        capex: 21_000,
        depreciation: 21_000,
        nwc_change: 750,
        is_forecast: true,
      },
    ])
  })

  it('drops stale FCFF residue from EBITDA-mode DCF forecast rows', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: 2025,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 900_000, ebitda: 90_000 },
          { year: 2023, revenue: 800_000, ebitda: 80_000 },
        ],
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          {
            year: '2026',
            revenue: 1_050_000,
            ebitda: 105_000,
            free_cash_flow: 1,
            capex: 21_000,
            depreciation: 21_000,
            nwc_change: 750,
            isForecast: true,
          },
        ],
        forecast_years_data: [
          {
            year: 2026,
            revenue: 0,
            ebitda: 0,
            free_cash_flow: 1,
          },
        ],
        dcf_input_mode: 'ebitda',
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.forecast_years_data).toEqual([
      {
        year: 2026,
        revenue: 1_050_000,
        ebitda: 105_000,
        capex: 21_000,
        depreciation: 21_000,
        nwc_change: 750,
        is_forecast: true,
      },
    ])
  })

  it('drops stale FCFF residue from explicit fallback forecast_years_data in EBITDA mode', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: 2025,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 900_000, ebitda: 90_000 },
          { year: 2023, revenue: 800_000, ebitda: 80_000 },
        ],
        yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        forecast_years_data: [
          {
            year: 2026,
            revenue: 1_050_000,
            ebitda: 105_000,
            free_cash_flow: 1,
          },
        ],
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.forecast_years_data).toEqual([
      {
        year: 2026,
        revenue: 1_050_000,
        ebitda: 105_000,
        is_forecast: true,
      },
    ])
  })

  it('keeps explicit FCFF only when the DCF input mode is FCFF-only', () => {
    const result = buildValuationRequest(
      makeFormData({
        current_year_data: {
          year: 2025,
          revenue: 1_000_000,
          ebitda: 100_000,
        },
        historical_years_data: [
          { year: 2024, revenue: 900_000, ebitda: 90_000 },
          { year: 2023, revenue: 800_000, ebitda: 80_000 },
        ],
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          {
            year: '2026',
            revenue: 1_050_000,
            ebitda: 105_000,
            free_cash_flow: 75_000,
            isForecast: true,
          },
        ],
        dcf_input_mode: 'fcff_only',
      } as Partial<ValuationFormData>),
      []
    )

    expect(result.forecast_years_data).toEqual([
      {
        year: 2026,
        revenue: 0,
        ebitda: 0,
        free_cash_flow: 75_000,
        is_forecast: true,
      },
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
          revenueSource: 'turnover',
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
      revenueSource: 'turnover',
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
})
