// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { isExplicitUserDcfIntent } from './valuationRequestBusinessContext'

describe('isExplicitUserDcfIntent', () => {
  it('returns true when user_weights include DCF', () => {
    expect(
      isExplicitUserDcfIntent(
        {},
        { user_weights: { dcf: 70, ebitda_multiple: 30 } } as ValuationFormData,
        0
      )
    ).toBe(true)
  })

  it('returns false for auto-seeded WACC alone', () => {
    expect(
      isExplicitUserDcfIntent({ dcf_wacc_pct: 10.5 }, {} as ValuationFormData, 0)
    ).toBe(false)
  })

  it('returns true for FCFF-only mode', () => {
    expect(
      isExplicitUserDcfIntent({ dcf_input_mode: 'fcff_only' }, {} as ValuationFormData, 0)
    ).toBe(true)
  })

  it('returns true when session JSONB pre-selected methods include DCF', () => {
    expect(
      isExplicitUserDcfIntent(
        {},
        {
          _pre_selected_valuation_methods: ['ebitda_multiple', 'dcf'],
        } as ValuationFormData,
        0
      )
    ).toBe(true)
  })
})
