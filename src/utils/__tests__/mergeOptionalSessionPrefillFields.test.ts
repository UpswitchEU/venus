import { describe, expect, it } from 'vitest'

import { mergeOptionalSessionPrefillFields } from '../mergeOptionalSessionPrefillFields'

const baseForm = {
  business_model: 'services',
  founding_year: 2010,
} as any

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
