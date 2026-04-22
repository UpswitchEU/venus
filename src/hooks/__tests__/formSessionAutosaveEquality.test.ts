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
