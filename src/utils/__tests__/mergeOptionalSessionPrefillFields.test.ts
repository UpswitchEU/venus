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
  it('ignores unrelated underscore keys for envelope hashing (optional content unchanged)', () => {
    const withNoise = {
      company_name: 'X',
      dcf_wacc_pct: 9.5,
      nav_hidden_reserves: 1,
      _foo: 1,
    } as Record<string, unknown>
    const base = { company_name: 'X', dcf_wacc_pct: 9.5, nav_hidden_reserves: 1 } as Record<
      string,
      unknown
    >
    expect(stableOptionalPrefillSourceSignature(withNoise)).toBe(
      stableOptionalPrefillSourceSignature(base)
    )
  })

  it('changes when company identity changes (chunked session delivery)', () => {
    const a = stableOptionalPrefillSourceSignature({
      company_name: 'X',
      dcf_wacc_pct: 9.5,
      nav_hidden_reserves: 1,
    } as Record<string, unknown>)
    const b = stableOptionalPrefillSourceSignature({
      company_name: 'Y',
      dcf_wacc_pct: 9.5,
      nav_hidden_reserves: 1,
    } as Record<string, unknown>)
    expect(a).not.toBe(b)
  })

  it('bumps when valuation-relevant session envelope grows (historical_years_data appears)', () => {
    const identityOnly = stableOptionalPrefillSourceSignature({
      company_name: 'Acme',
      kbo_number: '0123456789',
    } as Record<string, unknown>)
    const withHy = stableOptionalPrefillSourceSignature({
      company_name: 'Acme',
      kbo_number: '0123456789',
      historical_years_data: [{ year: 2023, revenue: 1, ebitda: 1 }],
    } as Record<string, unknown>)
    expect(identityOnly).not.toBe(withHy)
    expect(withHy).toContain('sd_env:')
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

  it('changes when import_quality confidence changes (alias keys)', () => {
    const low = stableOptionalPrefillSourceSignature({
      _import_quality: { '2023': { confidence_score: 0.2 } },
    } as Record<string, unknown>)
    const high = stableOptionalPrefillSourceSignature({
      import_quality: { '2023': { confidence_score: 0.9 } },
    } as Record<string, unknown>)
    expect(low).toContain('import_quality:')
    expect(low).not.toBe(high)
  })

  it('includes _financial_data_source in fingerprint', () => {
    expect(
      stableOptionalPrefillSourceSignature({ _financial_data_source: 'yuki' } as Record<
        string,
        unknown
      >)
    ).toContain('_financial_data_source:yuki')
  })

  it('changes when official_financials headline figures change', () => {
    const a = stableOptionalPrefillSourceSignature({
      official_financials: { filingYear: 2023, revenue: 100, ebitda: 10 },
    } as Record<string, unknown>)
    const b = stableOptionalPrefillSourceSignature({
      official_financials: { filing_year: 2023, revenue: 200, ebitda: 10 },
    } as Record<string, unknown>)
    expect(a).not.toBe(b)
  })

  it('changes when comparables set changes', () => {
    const one = stableOptionalPrefillSourceSignature({
      comparables: [{ id: 'a' }],
    } as Record<string, unknown>)
    const two = stableOptionalPrefillSourceSignature({
      comparables: [{ id: 'a' }, { id: 'b' }],
    } as Record<string, unknown>)
    expect(one).not.toBe(two)
  })

  it('changes when business_context SaaS provenance or ledger analysis shape changes', () => {
    const saas = stableOptionalPrefillSourceSignature({
      business_context: {
        _imported_saas_metrics: { arr: 1 },
        _imported_saas_provenance: { provider: 'stripe' },
      },
    } as Record<string, unknown>)
    const ledger = stableOptionalPrefillSourceSignature({
      business_context: {
        _imported_ledger_analysis: { sde_flags: [{}], tax_latency_candidates: [] },
      },
    } as Record<string, unknown>)
    expect(saas).toContain('business_context_meta')
    expect(ledger).toContain('business_context_meta')
    expect(saas).not.toBe(ledger)
  })

  it('includes persisted blend keys _user_weights and _pre_selected_valuation_methods', () => {
    const w = stableOptionalPrefillSourceSignature({
      _user_weights: { dcf: 0.5 },
    } as Record<string, unknown>)
    expect(w).toContain('user_weights_sig:')
    const m = stableOptionalPrefillSourceSignature({
      _pre_selected_valuation_methods: ['dcf', 'adjusted_nav'],
    } as Record<string, unknown>)
    expect(m).toContain('pre_selected_valuation_methods:adjusted_nav,dcf')
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

  it('fills method fields when form still has numeric zero placeholders', () => {
    const patch = mergeOptionalSessionPrefillFields(
      { dcf_wacc_pct: 10.2, nav_hidden_reserves: 42_000, saas_arr_growth_pct: 18 },
      { ...baseForm, dcf_wacc_pct: 0, nav_hidden_reserves: 0, saas_arr_growth_pct: 0 } as any
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
      } as any
    )
    expect((patch as any).nav_per_asset_tax_rates).toEqual({ real_estate: 20, inventory: 25 })
    expect((patch as any).nav_equipment_revaluation).toEqual({
      original_cost: 100000,
      tax_book_value: 40000,
    })
    expect((patch as any).capital_safe_notes).toEqual([{ amount: 50000, discount_pct: 20 }])
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
      } as any
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
      } as any
    ) as Record<string, unknown>
    expect((patch.business_context as Record<string, unknown>)._imported_ledger_analysis).toEqual(
      analysis
    )
    expect((patch.business_context as Record<string, unknown>).kbo_registration).toBe('0403.123.456')
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
      } as any
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
      } as any
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
      { ...baseForm, user_weights: { dcf: 0.5, ebitda_multiple: 0.5 } } as any
    )
    expect((patch as any).user_weights).toBeUndefined()
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
