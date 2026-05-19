import { describe, expect, it } from 'vitest'
import { extractMethodSelectionHints } from '../SessionMethodSelectionNormalizer'

describe('extractMethodSelectionHints', () => {
  it('distinguishes an absent single-method hint from explicit adaptive null', () => {
    expect(extractMethodSelectionHints({}).preSelectedValuationMethod).toBeUndefined()
    expect(
      extractMethodSelectionHints({ _pre_selected_valuation_method: null })
        .preSelectedValuationMethod
    ).toBeNull()
  })

  it('normalizes single-method hints and prefers the persisted UI key over engine output', () => {
    const hints = extractMethodSelectionHints({
      _pre_selected_valuation_method: ' EBITDA_MULTIPLE ',
      selected_method: 'DCF',
    })

    expect(hints.preSelectedValuationMethod).toBe('ebitda_multiple')
  })

  it('accepts flat blended-selection aliases from older session payloads', () => {
    const hints = extractMethodSelectionHints({
      pre_selected_valuation_methods: ['dcf', 'adjusted_nav'],
      user_weights: { dcf: 60, adjusted_nav: 40 },
      user_weight_justification: 'Client asked for floor + income.',
    })

    expect(hints.preSelectedMethods).toEqual(['dcf', 'adjusted_nav'])
    expect(hints.userWeights).toEqual({ dcf: 60, adjusted_nav: 40 })
    expect(hints.userWeightJustification).toBe('Client asked for floor + income.')
  })

  it('falls back to camelCase weights when persisted underscore keys are absent', () => {
    const hints = extractMethodSelectionHints({
      userWeights: { dcf: 50, ebitda_multiple: 50 },
    })

    expect(hints.userWeights).toEqual({ dcf: 50, ebitda_multiple: 50 })
  })
})
