import { describe, expect, it } from 'vitest'

import { getCurrentFilingYear } from '../fiscalYear'
import {
  mergeOptionalSessionPrefillFields,
  stableOptionalPrefillSourceSignature,
} from '../mergeOptionalSessionPrefillFields'

const baseForm = {
  business_model: 'services',
  founding_year: 2010,
} satisfies Record<string, unknown>

describe('mergeOptionalSessionPrefillFields', () => {
  it('fills empty DCF and NAV scalars when session has them', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        dcf_wacc_pct: 9.5,
        dcf_terminal_growth_pct: 2.5,
        dcf_discounting_convention: 'year_end',
        dcf_tax_shield_projections: [1.5, 1.125],
        nav_hidden_reserves: 10000,
        shares_for_sale: 100,
      },
      baseForm
    )
    expect(patch.dcf_wacc_pct).toBe(9.5)
    expect(patch.dcf_discounting_convention).toBe('year_end')
    expect(patch.dcf_tax_shield_projections).toEqual([1.5, 1.125])
    expect(patch.nav_hidden_reserves).toBe(10000)
    expect(patch.shares_for_sale).toBe(100)
  })

  it('does not overwrite existing user values', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { dcf_wacc_pct: 9.5, nav_hidden_reserves: 999 },
      { ...baseForm, dcf_wacc_pct: 8 }
    )
    expect(patch.dcf_wacc_pct).toBeUndefined()
    expect(patch.nav_hidden_reserves).toBe(999)
  })

  it('does not promote stale business_context identity when KBO differs', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        business_context: {
          kbo_registration: '0773.520.560',
          legal_form: 'Commanditaire vennootschap',
          dcf_terminal_growth_pct: 2.4,
        },
      },
      {
        ...baseForm,
        business_context: { kbo_registration_number: '1033.441.760' },
      }
    )

    expect(patch.business_context).toBeUndefined()
    expect(patch.legal_form).toBeUndefined()
    expect(patch.dcf_terminal_growth_pct).toBe(2.4)
  })

  it('fills method fields when form still has numeric zero placeholders', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { dcf_wacc_pct: 10.2, nav_hidden_reserves: 42_000, saas_arr_growth_pct: 18 },
      { ...baseForm, dcf_wacc_pct: 0, nav_hidden_reserves: 0, saas_arr_growth_pct: 0 }
    )
    expect(patch.dcf_wacc_pct).toBe(10.2)
    expect(patch.nav_hidden_reserves).toBe(42_000)
    expect(patch.saas_arr_growth_pct).toBe(18)
  })

  it('fills deal and capital scalar fields when form slots are empty', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        deal_type: 'compare',
        deal_registration_duty_pct: 12,
        capital_history_enabled: true,
        capital_round_amount: 350000,
        capital_last_round_date: '2024-12-31',
      },
      baseForm
    )
    expect(patch.deal_type).toBe('compare')
    expect(patch.deal_registration_duty_pct).toBe(12)
    expect(patch.capital_history_enabled).toBe(true)
    expect(patch.capital_round_amount).toBe(350000)
    expect(patch.capital_last_round_date).toBe('2024-12-31')
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

  it('merges legacy _taxLatencies alias when tax_latencies key is absent', () => {
    const tl = [{ id: 'tl_1', type: 'passive' as const, description: 'x' }]
    const patch = mergeOptionalSessionPrefillFields(
      {
        _taxLatencies: tl,
      },
      baseForm
    )
    expect(patch.tax_latencies).toEqual(tl)
  })

  it('merges _normalizations alias when form has no persisted normalizations yet', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        _normalizations: [{ id: 'n1', status: 'accepted', year: 2024, adjustment: 1000 }],
      },
      baseForm
    ) as Record<string, unknown>
    expect(Array.isArray(patch._normalizations)).toBe(true)
    expect((patch._normalizations as unknown[]).length).toBe(1)
  })

  it('merges structured method fields when form has empty struct slots', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        nav_per_asset_tax_rates: { real_estate: 20, inventory: 25 },
        nav_equipment_revaluation: { original_cost: 100000, tax_book_value: 40000 },
        capital_safe_notes: [{ amount: 50000, discount_pct: 20 }],
      },
      {
        ...baseForm,
        nav_per_asset_tax_rates: {},
        nav_equipment_revaluation: {},
        capital_safe_notes: [],
      }
    )
    expect((patch as Record<string, unknown>).nav_per_asset_tax_rates).toEqual({
      real_estate: 20,
      inventory: 25,
    })
    expect((patch as Record<string, unknown>).nav_equipment_revaluation).toEqual({
      original_cost: 100000,
      tax_book_value: 40000,
    })
    expect((patch as Record<string, unknown>).capital_safe_notes).toEqual([
      { amount: 50000, discount_pct: 20 },
    ])
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
      { ...baseForm, current_year_data: { year: 2023 } }
    )
    expect(patch.current_year_data?.revenue).toBe(1_000_000)
    expect(patch.current_year_data?.ebitda).toBe(100_000)
  })

  it('merges forecast_years_data when form forecast empty', () => {
    const fc = [{ year: 2024, revenue: 1e6, ebitda: 1e5, is_forecast: true as const }]
    const patch = mergeOptionalSessionPrefillFields({ forecast_years_data: fc }, baseForm)
    expect(patch.forecast_years_data).toEqual(fc)
  })

  it('sanitizes stale FCFF when merging default EBITDA-mode forecast_years_data', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        forecast_years_data: [
          { year: 2026, revenue: 1_050_000, ebitda: 105_000, free_cash_flow: 1 },
        ],
      },
      baseForm
    )
    expect(patch.forecast_years_data).toEqual([{ year: 2026, revenue: 1_050_000, ebitda: 105_000 }])
  })

  it('preserves FCFF when merging FCFF-only forecast_years_data', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        dcf_input_mode: 'fcff_only',
        forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
      },
      baseForm
    )
    expect(patch.dcf_input_mode).toBe('fcff_only')
    expect(patch.forecast_years_data).toEqual([
      { year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 },
    ])
  })

  it('treats default EBITDA mode as empty when restoring explicit FCFF-only forecast_years_data', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        dcf_input_mode: 'fcff_only',
        forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
      },
      {
        ...baseForm,
        dcf_input_mode: 'ebitda',
      }
    )
    expect(patch.dcf_input_mode).toBe('fcff_only')
    expect(patch.forecast_years_data).toEqual([
      { year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 },
    ])
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

  it('promotes latest real year_data row over a default current-year zero placeholder', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        year_data: {
          2025: { revenue: 11_282_327, ebitda: 1_200_000 },
          2024: { revenue: 11_282_327, ebitda: 1_115_950 },
          2023: { revenue: 11_282_327, ebitda: 1_045_723 },
        },
      },
      {
        ...baseForm,
        current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
        yearlyFinancials: [
          { year: '2025', revenue: 0, ebitda: 0 },
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
        ],
      }
    )

    expect(patch.current_year_data).toEqual({
      year: 2025,
      revenue: 11_282_327,
      ebitda: 1_200_000,
    })
    expect(patch.historical_years_data).toEqual([
      { year: 2023, revenue: 11_282_327, ebitda: 1_045_723 },
      { year: 2024, revenue: 11_282_327, ebitda: 1_115_950 },
    ])
    expect((patch as Record<string, unknown>).yearlyFinancials).toEqual([
      { year: '2025', revenue: 11_282_327, ebitda: 1_200_000 },
      { year: '2024', revenue: 11_282_327, ebitda: 1_115_950 },
      { year: '2023', revenue: 11_282_327, ebitda: 1_045_723 },
    ])
    expect(patch.revenue).toBe(11_282_327)
    expect(patch.ebitda).toBe(1_200_000)
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
      }
    )
    expect(patch.yearlyFinancials?.some((r) => r.revenue === 500_000)).toBe(true)
  })

  it('copies session yearlyFinancials when there is no historical_years_data expansion', () => {
    const fy = getCurrentFilingYear()
    const grid = [
      { year: String(fy - 1), revenue: 900_000, ebitda: 90_000 },
      { year: String(fy), revenue: 0, ebitda: 0 },
    ]
    const patch = mergeOptionalSessionPrefillFields(
      { yearlyFinancials: grid },
      {
        ...baseForm,
        yearlyFinancials: [
          { year: String(fy), revenue: 0, ebitda: 0 },
          { year: String(fy - 1), revenue: 0, ebitda: 0 },
        ],
      }
    )
    expect((patch as Record<string, unknown>).yearlyFinancials).toEqual(grid)
  })

  it('fills metadata when form slot is empty', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { metadata: { startup_advisor_cta_url: 'https://example.com/advisor' } },
      baseForm
    ) as Record<string, unknown>
    expect(patch.metadata).toEqual({ startup_advisor_cta_url: 'https://example.com/advisor' })
  })

  it('fills business_context when empty (integration SaaS / ledger for SDE/Omni)', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { business_context: { _imported_saas_metrics: { arr: 100 } } as Record<string, unknown> },
      baseForm
    ) as Record<string, unknown>
    expect(patch.business_context).toMatchObject({ _imported_saas_metrics: { arr: 100 } })
  })

  it('merges integration keys into existing business_context without clobbering KBO', () => {
    const analysis = { sde_flags: [{ id: 'a' }], tax_latency_candidates: [] }
    const patch = mergeOptionalSessionPrefillFields(
      {
        business_context: {
          kbo_registration: '0403.123.456',
          _imported_ledger_analysis: analysis,
        },
      } as Record<string, unknown>,
      {
        ...baseForm,
        business_context: {
          kbo_registration: '0403.123.456',
          company_id: '0403.123.456',
        },
      }
    ) as Record<string, unknown>
    expect((patch.business_context as Record<string, unknown>)._imported_ledger_analysis).toEqual(
      analysis
    )
    expect((patch.business_context as Record<string, unknown>).kbo_registration).toBe(
      '0403.123.456'
    )
  })

  it('promotes adaptive preferences from business_context camelCase aliases', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        business_context: {
          dcfPreference: 0.8,
          multiplesPreference: 0.2,
          ownerDependencyImpact: 0.6,
        },
      } as Record<string, unknown>,
      baseForm
    ) as Record<string, unknown>
    expect(patch._internal_dcf_preference).toBe(0.8)
    expect(patch._internal_multiples_preference).toBe(0.2)
    expect(patch._internal_owner_dependency_impact).toBe(0.6)
  })

  it('fills narrative + employee aliases for adaptive/omni context', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        business_description: 'Family-owned specialist in precision parts.',
        subIndustry: 'manufacturing_precision',
        taxonomy: 'sme/manufacturing',
        number_of_employees: 14,
        employee_count: 14,
      },
      baseForm
    ) as Record<string, unknown>
    expect(patch.business_description).toContain('precision parts')
    expect(patch.subIndustry).toBe('manufacturing_precision')
    expect(patch.taxonomy).toBe('sme/manufacturing')
    expect(patch.number_of_employees).toBe(14)
    expect(patch.employee_count).toBe(14)
  })

  it('changes fingerprint when yearlyFinancials grid gains real figures', () => {
    const fy = getCurrentFilingYear()
    const a = stableOptionalPrefillSourceSignature({
      yearlyFinancials: [{ year: String(fy - 1), revenue: 0, ebitda: 0 }],
    } as Record<string, unknown>)
    const b = stableOptionalPrefillSourceSignature({
      yearlyFinancials: [{ year: String(fy - 1), revenue: 500_000, ebitda: 50_000 }],
    } as Record<string, unknown>)
    expect(b).toContain('yearlyFinancials:')
    expect(a).not.toBe(b)
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

  it('fills missing current_year_data detail cells without overriding existing revenue/ebitda', () => {
    const fy = getCurrentFilingYear()
    const patch = mergeOptionalSessionPrefillFields(
      {
        current_year_data: {
          year: fy,
          revenue: 900_000,
          ebitda: 120_000,
          total_assets: 450_000,
          total_equity: 210_000,
        },
      },
      {
        ...baseForm,
        current_year_data: { year: fy, revenue: 900_000, ebitda: 120_000 },
      }
    ) as Record<string, unknown>
    expect((patch.current_year_data as Record<string, unknown>)?.revenue).toBe(900_000)
    expect((patch.current_year_data as Record<string, unknown>)?.ebitda).toBe(120_000)
    expect((patch.current_year_data as Record<string, unknown>)?.total_assets).toBe(450_000)
    expect((patch.current_year_data as Record<string, unknown>)?.total_equity).toBe(210_000)
  })

  it('fills official_financials and variance from nested official_financials when form has no trust strip', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        official_financials: {
          filingYear: 2024,
          revenue: 5_000_000,
          varianceAnalysis: { state: 'explained' },
        },
      },
      baseForm
    ) as Record<string, unknown>
    expect(patch.official_financials).toMatchObject({ filingYear: 2024, revenue: 5_000_000 })
    expect(patch.official_variance_analysis).toEqual({ state: 'explained' })
  })

  it('does not overwrite usable official_financials on the form', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        official_financials: { filingYear: 2023, revenue: 99 },
      },
      {
        ...baseForm,
        official_financials: { filingYear: 2022, revenue: 1, ebitda: 1 },
      }
    )
    expect(patch.official_financials).toBeUndefined()
  })

  it('merges comparables when form has none', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        comparables: [{ name: 'Peer A', ev_ebitda_multiple: 8 }],
      },
      baseForm
    )
    expect(patch.comparables?.length).toBe(1)
    expect(patch.comparables?.[0]?.name).toBe('Peer A')
  })

  it('merges user_weights and startup_inputs when form struct slots empty', () => {
    const patch = mergeOptionalSessionPrefillFields(
      {
        user_weights: { dcf: 0.5, ebitda_multiple: 0.5 },
        startup_inputs: { company_stage: 'seed' },
        cap_table: { option_pool_pct: 10 },
        selected_method: 'dcf',
        investment_amount_sought: 250000,
      },
      baseForm
    ) as Record<string, unknown>
    expect(patch.user_weights).toEqual({ dcf: 0.5, ebitda_multiple: 0.5 })
    expect(patch.startup_inputs).toEqual({ company_stage: 'seed' })
    expect(patch.cap_table).toEqual({ option_pool_pct: 10 })
    expect(patch.selected_method).toBe('dcf')
    expect(patch.investment_amount_sought).toBe(250000)
  })

  it('merges user_weights from _user_weights when user_weights absent', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { _user_weights: { ebitda_multiple: 55, adjusted_nav: 45 } },
      baseForm
    ) as Record<string, unknown>
    expect(patch.user_weights).toEqual({ ebitda_multiple: 55, adjusted_nav: 45 })
  })

  it('does not overwrite existing user_weights via _user_weights alias', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { _user_weights: { dcf: 1 } },
      {
        ...baseForm,
        user_weights: { dcf: 0.5, ebitda_multiple: 0.5 },
      }
    )
    expect((patch as Record<string, unknown>).user_weights).toBeUndefined()
  })

  it('does not overwrite existing historical_years_data', () => {
    const existing = [{ year: 2020, revenue: 1, ebitda: 1 }]
    const patch = mergeOptionalSessionPrefillFields(
      { historical_years_data: [{ year: 2019, revenue: 2, ebitda: 2 }] },
      { ...baseForm, historical_years_data: existing }
    )
    expect(patch.historical_years_data).toBeUndefined()
  })
})
