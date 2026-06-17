import { describe, expect, it } from 'vitest'

import { areFormAndSessionDataEqualForAutosync } from '../useFormSessionSync'

const base = {
  company_name: 'A',
  revenue: 1_000_000,
  ebitda: 200_000,
  industry: 'X',
  business_model: 'services',
  founding_year: 2010,
  business_type_id: 1,
  rev_recurring_amount: 0,
  rev_top_client_amount: 0,
  rev_gross_churn_pct: 0,
  filing_year_confirmed: false,
  historical_years_data: [],
  forecast_years_data: [],
} as const

describe('areFormAndSessionDataEqualForAutosync', () => {
  it('returns false when only DCF assumptions differ', () => {
    const form = { ...base, dcf_wacc_pct: 10 }
    const sess = { ...base, dcf_wacc_pct: 9 }
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('returns false when only dcf_terminal_value_method differs', () => {
    const form = { ...base, dcf_terminal_value_method: 'exit_multiple' as const }
    const sess = { ...base, dcf_terminal_value_method: 'perpetuity_growth' as const }
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('returns true when optional method slice matches', () => {
    const a = { ...base, dcf_wacc_pct: 9, nav_hidden_reserves: 1000 }
    const b = { ...base, dcf_wacc_pct: 9, nav_hidden_reserves: 1000 }
    expect(areFormAndSessionDataEqualForAutosync(a, b)).toBe(true)
  })

  it('returns false when only owner_salary_addback differs (SDE autosave must run)', () => {
    const form = { ...base, owner_salary_addback: 90_000 }
    const sess = { ...base, owner_salary_addback: 72_000 }
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('returns false when only adaptive _internal_key_metrics differs', () => {
    const form = { ...base, _internal_key_metrics: ['ebitda', 'revenue'] }
    const sess = { ...base, _internal_key_metrics: ['ebitda'] }
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('treats optional scalars under _businessInfo as equal to top-level form (prefill surface)', () => {
    const form = { ...base, dcf_wacc_pct: 9 }
    const sess = { ...base, _businessInfo: { dcf_wacc_pct: 9 } } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('treats key card metrics only under _businessInfo as equal to flat form (Mercury link shape)', () => {
    const form = { ...base }
    const sess = {
      _businessInfo: {
        company_name: 'A',
        revenue: 1_000_000,
        ebitda: 200_000,
        industry: 'X',
        business_model: 'services',
        founding_year: 2010,
        business_type_id: 1,
        rev_recurring_amount: 0,
        rev_top_client_amount: 0,
        rev_gross_churn_pct: 0,
      },
      filing_year_confirmed: false,
      historical_years_data: [],
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('treats Mercury empty-string top-level company_name as equal when card has the name', () => {
    const form = { ...base }
    const sess = {
      company_name: '',
      _businessInfo: {
        company_name: 'A',
        revenue: 1_000_000,
        ebitda: 200_000,
        industry: 'X',
        business_model: 'services',
        founding_year: 2010,
        business_type_id: 1,
        rev_recurring_amount: 0,
        rev_top_client_amount: 0,
        rev_gross_churn_pct: 0,
      },
      filing_year_confirmed: false,
      historical_years_data: [],
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('uses top-level session values over _businessInfo when both present', () => {
    const form = { ...base, revenue: 2_000_000 }
    const sess = {
      _businessInfo: { ...base, revenue: 1_000_000 },
      revenue: 2_000_000,
      historical_years_data: [],
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('returns false when top-level session overrides _businessInfo but form matches only nested card', () => {
    const form = { ...base, revenue: 1_000_000 }
    const sess = {
      _businessInfo: { ...base },
      revenue: 2_000_000,
      historical_years_data: [],
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('compares current_year_data from merged _businessInfo surface', () => {
    const cyd = { year: 2023, revenue: 500_000, ebitda: 100_000 }
    const form = { ...base, current_year_data: cyd }
    const sess = {
      _businessInfo: {
        company_name: 'A',
        revenue: 1_000_000,
        ebitda: 200_000,
        industry: 'X',
        business_model: 'services',
        founding_year: 2010,
        business_type_id: 1,
        rev_recurring_amount: 0,
        rev_top_client_amount: 0,
        rev_gross_churn_pct: 0,
        current_year_data: cyd,
      },
      filing_year_confirmed: false,
      historical_years_data: [],
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('ignores provider-only raw year_data when normalized financial rows already match', () => {
    const current = {
      year: 2024,
      revenue: 1_000_000,
      ebitda: 200_000,
      cash: 50_000,
      total_debt: 25_000,
    }
    const historical = [
      {
        year: 2023,
        revenue: 900_000,
        ebitda: 180_000,
        capex: 15_000,
        free_cash_flow: 125_000,
      },
    ]
    const form = {
      ...base,
      current_year_data: current,
      historical_years_data: historical,
    }
    const sess = {
      ...base,
      current_year_data: current,
      historical_years_data: historical,
      year_data: {
        2024: current,
        2023: historical[0],
      },
      _financial_data_source: 'silverfin',
      _import_quality: {
        2024: { confidence_score: 0.94 },
        2023: { confidence_score: 0.91 },
      },
    } as Record<string, unknown>

    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('normalizes numeric strings in current_year_data to avoid autosave churn', () => {
    const form = {
      ...base,
      current_year_data: {
        year: 2024,
        revenue: 1_000_000,
        ebitda: 200_000,
        cash: 50_000,
      },
    }
    const sess = {
      ...base,
      current_year_data: {
        year: '2024',
        revenue: '1000000',
        ebitda: '200000',
        cash: '50000',
      },
    } as Record<string, unknown>

    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('returns false when current_year_data balance-sheet fields differ', () => {
    const form = {
      ...base,
      current_year_data: {
        year: 2024,
        revenue: 1_000_000,
        ebitda: 200_000,
        cash: 50_000,
      },
    }
    const sess = {
      ...base,
      current_year_data: {
        year: 2024,
        revenue: 1_000_000,
        ebitda: 200_000,
        cash: 75_000,
      },
    } as Record<string, unknown>

    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('returns false when historical-year cash-flow detail differs', () => {
    const form = {
      ...base,
      historical_years_data: [
        { year: 2023, revenue: 900_000, ebitda: 180_000, capex: 15_000 },
      ],
    }
    const sess = {
      ...base,
      historical_years_data: [
        { year: 2023, revenue: 900_000, ebitda: 180_000, capex: 20_000 },
      ],
    } as Record<string, unknown>

    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('reads _taxLatencies from merged surface when only stored under _businessInfo', () => {
    const tl = [{ id: 'x', type: 'passive' as const }]
    const form = { ...base }
    const sess = {
      _businessInfo: { ...base, _taxLatencies: tl },
      filing_year_confirmed: false,
      historical_years_data: [],
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess, tl)).toBe(true)
  })

  it('compares historical_years_data from merged _businessInfo surface', () => {
    const hist = [{ year: 2022, revenue: 100, ebitda: 10 }]
    const form = { ...base, historical_years_data: hist }
    const sess = {
      _businessInfo: { ...base, historical_years_data: hist },
      filing_year_confirmed: false,
      forecast_years_data: [],
    } as Record<string, unknown>
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(true)
  })

  it('compares forecast after both historical slices are empty (no early return bug)', () => {
    const form = { ...base, forecast_years_data: [{ year: 2027, revenue: 1, ebitda: 1 }] }
    const sess = { ...base, forecast_years_data: [] }
    expect(areFormAndSessionDataEqualForAutosync(form, sess)).toBe(false)
  })

  it('returns false when tax latencies differ (third argument)', () => {
    const form = { ...base }
    const sess = { ...base, _taxLatencies: [{ id: 'a' }] }
    expect(areFormAndSessionDataEqualForAutosync(form, sess, [])).toBe(false)
  })

  it('returns true when tax latencies match session', () => {
    const tl = [{ id: 'x', type: 'passive' as const }]
    const form = { ...base }
    const sess = { ...base, _taxLatencies: tl }
    expect(areFormAndSessionDataEqualForAutosync(form, sess, tl)).toBe(true)
  })

  it('treats boolean true and string "true" as equal for filing_year_confirmed (no sync thrash)', () => {
    const a = { ...base, filing_year_confirmed: true as const }
    const b = { ...base, filing_year_confirmed: 'true' as any }
    expect(areFormAndSessionDataEqualForAutosync(a, b)).toBe(true)
  })

  it('treats boolean true and string "1" as equal (ORM / DB bit serialization)', () => {
    const a = { ...base, filing_year_confirmed: true as const }
    const b = { ...base, filing_year_confirmed: '1' as any }
    expect(areFormAndSessionDataEqualForAutosync(a, b)).toBe(true)
  })

  it('treats false and string "false" as equal for filing_year_confirmed', () => {
    const a = { ...base, filing_year_confirmed: false as const }
    const b = { ...base, filing_year_confirmed: 'false' as any }
    expect(areFormAndSessionDataEqualForAutosync(a, b)).toBe(true)
  })

  it('returns false when only filing_year_confirmed semantically differs', () => {
    const a = { ...base, filing_year_confirmed: true as const }
    const b = { ...base, filing_year_confirmed: false as const }
    expect(areFormAndSessionDataEqualForAutosync(a, b)).toBe(false)
  })
})
