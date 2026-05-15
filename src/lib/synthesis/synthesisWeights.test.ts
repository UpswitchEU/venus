// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildSynthesisWeightPayload } from './synthesisWeights'

describe('buildSynthesisWeightPayload', () => {
  it('returns null for single-method selections', () => {
    expect(
      buildSynthesisWeightPayload({
        preSelectedMethods: ['dcf'],
        userWeights: { dcf: 100 },
      })
    ).toBeNull()
  })

  it('returns null when adaptive is selected', () => {
    expect(
      buildSynthesisWeightPayload({
        preSelectedMethods: ['upswitch_adaptive', 'dcf'],
        userWeights: { upswitch_adaptive: 50, dcf: 50 },
      })
    ).toBeNull()
  })

  it('converts integer percentages into Titan fractions', () => {
    expect(
      buildSynthesisWeightPayload({
        preSelectedMethods: ['dcf', 'ebitda_multiple', 'adjusted_nav'],
        userWeights: { dcf: 20, ebitda_multiple: 50, adjusted_nav: 30 },
      })
    ).toEqual({
      user_weights: {
        dcf: 0.2,
        ebitda_multiple: 0.5,
        adjusted_nav: 0.3,
      },
    })
  })

  it('trims the advisor justification and omits empty copy', () => {
    expect(
      buildSynthesisWeightPayload({
        preSelectedMethods: ['dcf', 'ebitda_multiple'],
        userWeights: { dcf: 40, ebitda_multiple: 60 },
        userWeightJustification: '  DCF weighted lower due to forecast uncertainty.  ',
      })
    ).toEqual({
      user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
      user_weight_justification: 'DCF weighted lower due to forecast uncertainty.',
    })

    expect(
      buildSynthesisWeightPayload({
        preSelectedMethods: ['dcf', 'ebitda_multiple'],
        userWeights: { dcf: 40, ebitda_multiple: 60 },
        userWeightJustification: '   ',
      })
    ).toEqual({
      user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
    })
  })
})
