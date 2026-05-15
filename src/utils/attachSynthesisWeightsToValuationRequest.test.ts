// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationRequest } from '@/types/valuation'
import { attachSynthesisWeightsToValuationRequest } from './attachSynthesisWeightsToValuationRequest'

const DEFAULT_SELECTION = {
  preSelectedMethods: ['upswitch_adaptive'],
  userWeights: {},
  userWeightJustification: '',
}

describe('attachSynthesisWeightsToValuationRequest', () => {
  it('does nothing when fewer than two methods are selected', () => {
    const request = {} as ValuationRequest

    attachSynthesisWeightsToValuationRequest(request, {
      ...DEFAULT_SELECTION,
      preSelectedMethods: ['dcf'],
      userWeights: { dcf: 100 },
      userWeightJustification: 'single method',
    })

    expect(request.user_weights).toBeUndefined()
    expect(request.user_weight_justification).toBeUndefined()
  })

  it('does nothing when adaptive is part of selection', () => {
    const request = {} as ValuationRequest

    attachSynthesisWeightsToValuationRequest(request, {
      ...DEFAULT_SELECTION,
      preSelectedMethods: ['upswitch_adaptive', 'dcf'],
      userWeights: { upswitch_adaptive: 50, dcf: 50 },
      userWeightJustification: 'adaptive mix',
    })

    expect(request.user_weights).toBeUndefined()
    expect(request.user_weight_justification).toBeUndefined()
  })

  it('attaches fractional weights and keeps justification for 30/70 synthesis', () => {
    const request = {} as ValuationRequest

    attachSynthesisWeightsToValuationRequest(request, {
      ...DEFAULT_SELECTION,
      preSelectedMethods: ['dcf', 'ebitda_multiple'],
      userWeights: { dcf: 30, ebitda_multiple: 70 },
      userWeightJustification: 'Income stability dominates but DCF still matters.',
    })

    expect(request.user_weights).toEqual({
      dcf: 0.3,
      ebitda_multiple: 0.7,
    })
    expect(request.user_weight_justification).toBe(
      'Income stability dominates but DCF still matters.'
    )
  })

  it('normalizes fallback equal weights when user weights are invalid', () => {
    const request = {} as ValuationRequest

    attachSynthesisWeightsToValuationRequest(request, {
      ...DEFAULT_SELECTION,
      preSelectedMethods: ['dcf', 'ebitda_multiple'],
      userWeights: { dcf: 10, ebitda_multiple: 10 },
      userWeightJustification: '',
    })

    expect(request.user_weights).toEqual({
      dcf: 0.5,
      ebitda_multiple: 0.5,
    })
    expect(request.user_weight_justification).toBeUndefined()
  })
})
