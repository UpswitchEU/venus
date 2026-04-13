import { describe, expect, it } from 'vitest'

import {
  mergeOptionalSessionPrefillFields,
  stableOptionalPrefillSourceSignature,
} from '../mergeOptionalSessionPrefillFields'

const baseForm = {
  business_model: 'services',
  founding_year: 2010,
} as any

describe('stableOptionalPrefillSourceSignature', () => {
  it('is stable for same optional content and ignores unrelated keys', () => {
    const a = { company_name: 'X', dcf_wacc_pct: 9.5, nav_hidden_reserves: 1 }
    const b = { company_name: 'Y', dcf_wacc_pct: 9.5, nav_hidden_reserves: 1, _foo: 1 }
    expect(stableOptionalPrefillSourceSignature(a)).toBe(stableOptionalPrefillSourceSignature(b))
  })

  it('changes when _internal_key_metrics changes', () => {
    const a = { _internal_key_metrics: ['ebitda'] }
    const b = { _internal_key_metrics: ['ebitda', 'revenue'] }
    expect(stableOptionalPrefillSourceSignature(a)).not.toBe(stableOptionalPrefillSourceSignature(b))
  })

  it('includes user_configured_dcf when present', () => {
    expect(stableOptionalPrefillSourceSignature({ user_configured_dcf: true })).toContain(
      'user_configured_dcf'
    )
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
    const tl = [{ type: 'active' as const, description: 'x', temporary_difference: 1, tax_rate: 0.25 }]
    const patch = mergeOptionalSessionPrefillFields(
      { tax_latencies: tl, balance_sheet_adjustments: [{ id: '1', label: 'a', amount: 1, type: 'add', category: 'other' }] },
      baseForm
    )
    expect(patch.tax_latencies).toEqual(tl)
    expect(patch.balance_sheet_adjustments?.length).toBe(1)
  })
})
