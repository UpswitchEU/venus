import { afterEach, describe, expect, it } from 'vitest'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { attachSynthesisWeightsToValuationRequest } from './attachSynthesisWeightsToValuationRequest'

const DEFAULT_STATE = {
  preSelectedMethods: ['upswitch_adaptive'],
  userWeights: {},
  userWeightJustification: '',
}

describe('attachSynthesisWeightsToValuationRequest', () => {
  afterEach(() => {
    useManualResultsStore.setState(DEFAULT_STATE)
  })

  it('does nothing when fewer than two methods are selected', () => {
    useManualResultsStore.setState({
      preSelectedMethods: ['dcf'],
      userWeights: { dcf: 100 },
      userWeightJustification: 'single method',
    })
    const request: Record<string, unknown> = {}

    attachSynthesisWeightsToValuationRequest(request as any)

    expect(request.user_weights).toBeUndefined()
    expect(request.user_weight_justification).toBeUndefined()
  })

  it('does nothing when adaptive is part of selection', () => {
    useManualResultsStore.setState({
      preSelectedMethods: ['upswitch_adaptive', 'dcf'],
      userWeights: { upswitch_adaptive: 50, dcf: 50 },
      userWeightJustification: 'adaptive mix',
    })
    const request: Record<string, unknown> = {}

    attachSynthesisWeightsToValuationRequest(request as any)

    expect(request.user_weights).toBeUndefined()
    expect(request.user_weight_justification).toBeUndefined()
  })

  it('attaches fractional weights and keeps justification for 30/70 synthesis', () => {
    useManualResultsStore.setState({
      preSelectedMethods: ['dcf', 'ebitda_multiple'],
      userWeights: { dcf: 30, ebitda_multiple: 70 },
      userWeightJustification: 'Income stability dominates but DCF still matters.',
    })
    const request: Record<string, unknown> = {}

    attachSynthesisWeightsToValuationRequest(request as any)

    expect(request.user_weights).toEqual({
      dcf: 0.3,
      ebitda_multiple: 0.7,
    })
    expect(request.user_weight_justification).toBe('Income stability dominates but DCF still matters.')
  })

  it('normalizes fallback equal weights when user weights are invalid', () => {
    useManualResultsStore.setState({
      preSelectedMethods: ['dcf', 'ebitda_multiple'],
      userWeights: { dcf: 10, ebitda_multiple: 10 },
      userWeightJustification: '',
    })
    const request: Record<string, unknown> = {}

    attachSynthesisWeightsToValuationRequest(request as any)

    expect(request.user_weights).toEqual({
      dcf: 0.5,
      ebitda_multiple: 0.5,
    })
    expect(request.user_weight_justification).toBeUndefined()
  })
})
