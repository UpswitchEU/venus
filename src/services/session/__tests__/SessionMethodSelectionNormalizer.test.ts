import { describe, expect, it } from 'vitest'
import {
  extractMethodDataPlan,
  extractMethodSelectionHints,
} from '../SessionMethodSelectionNormalizer'

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

  it('accepts selected_methods as a blended-selection fallback', () => {
    const hints = extractMethodSelectionHints({
      selected_methods: ['ebitda_multiple', 'dcf'],
      user_weights: { ebitda_multiple: 0.5, dcf: 0.5 },
    })

    expect(hints.preSelectedMethods).toEqual(['ebitda_multiple', 'dcf'])
    expect(hints.userWeights).toEqual({ ebitda_multiple: 50, dcf: 50 })
  })

  it('accepts methods as the last blended-selection fallback', () => {
    const hints = extractMethodSelectionHints({
      methods: ['ebitda_multiple', 'dcf'],
    })

    expect(hints.preSelectedMethods).toEqual(['ebitda_multiple', 'dcf'])
  })

  it('falls back to camelCase weights when persisted underscore keys are absent', () => {
    const hints = extractMethodSelectionHints({
      userWeights: { dcf: 50, ebitda_multiple: 50 },
    })

    expect(hints.userWeights).toEqual({ dcf: 50, ebitda_multiple: 50 })
  })
})

describe('extractMethodDataPlan', () => {
  it('returns undefined when the plan is absent, mistyped, or empty', () => {
    expect(extractMethodDataPlan({})).toBeUndefined()
    expect(extractMethodDataPlan({ _data_input_plan: 'nope' })).toBeUndefined()
    expect(extractMethodDataPlan({ _data_input_plan: { perMethod: [] } })).toBeUndefined()
    expect(extractMethodDataPlan({ _data_input_plan: { perMethod: 'bad' } })).toBeUndefined()
  })

  it('lifts the plan from the _data_input_plan envelope, dropping entries with no method', () => {
    const plan = extractMethodDataPlan({
      _data_input_plan: {
        nextDataAction: 'provide_method_inputs',
        unlockHint: 'Add the inputs below.',
        perMethod: [
          {
            method: 'dcf',
            fieldsToCollect: ['discount_rate', 'terminal_growth'],
            requiredInputSections: ['dcf_global'],
          },
          { method: '', fieldsToCollect: ['x'] },
          { fieldsToCollect: ['y'] },
        ],
      },
    })

    expect(plan).toEqual({
      nextDataAction: 'provide_method_inputs',
      unlockHint: 'Add the inputs below.',
      perMethod: [
        {
          method: 'dcf',
          fieldsToCollect: ['discount_rate', 'terminal_growth'],
          requiredInputSections: ['dcf_global'],
        },
      ],
    })
  })

  it('accepts the flat data_input_plan fallback and defaults the soft fields', () => {
    const plan = extractMethodDataPlan({
      data_input_plan: { perMethod: [{ method: 'ebitda_multiple', fieldsToCollect: [] }] },
    })

    expect(plan).toEqual({
      nextDataAction: 'none',
      unlockHint: null,
      perMethod: [{ method: 'ebitda_multiple', fieldsToCollect: [] }],
    })
  })
})
