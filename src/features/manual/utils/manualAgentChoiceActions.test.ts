import { describe, expect, it } from 'vitest'
import type { AgentChoiceSelection } from '@/components/calculator'
import {
  buildAgentChoiceFollowUpPrompt,
  parseAgentMethodWeightChoice,
  parseAgentValuationScenarioChoice,
} from './manualAgentChoiceActions'

function single(value: string, label = value): AgentChoiceSelection {
  return {
    id: 'choice-1',
    kind: 'single_select',
    title: 'Pick weights',
    submitPath: '/api/valuations/method-weights',
    value,
    selectedOptions: [{ value, label }],
  }
}

function multi(values: string[]): AgentChoiceSelection {
  return {
    id: 'choice-1',
    kind: 'multi_select',
    title: 'Pick weights',
    submitPath: '/api/valuations/method-weights',
    values,
    selectedOptions: values.map((value) => ({ value, label: value })),
  }
}

describe('manualAgentChoiceActions', () => {
  it('parses delimited method-weight presets into manual synthesis state', () => {
    expect(parseAgentMethodWeightChoice(single('dcf=70, ebitda_multiple=30'), [])).toEqual({
      methods: ['dcf', 'ebitda_multiple'],
      weights: { dcf: 70, ebitda_multiple: 30 },
    })
  })

  it('parses JSON weight presets and converts Titan fractions to UI percentages', () => {
    expect(
      parseAgentMethodWeightChoice(
        single(
          JSON.stringify({
            user_weights: { dcf: 0.6, adjusted_nav: 0.4 },
            justification: 'Forecast proof leads, asset floor anchors downside.',
          })
        ),
        []
      )
    ).toEqual({
      methods: ['dcf', 'adjusted_nav'],
      weights: { dcf: 60, adjusted_nav: 40 },
      justification: 'Forecast proof leads, asset floor anchors downside.',
    })
  })

  it('applies equal weights to the current method selection when requested', () => {
    expect(parseAgentMethodWeightChoice(single('equal'), ['dcf', 'ebitda_multiple'])).toEqual({
      methods: ['dcf', 'ebitda_multiple'],
      weights: { dcf: 50, ebitda_multiple: 50 },
    })
  })

  it('treats selected method names as an equal-weight blend', () => {
    expect(
      parseAgentMethodWeightChoice(multi(['dcf', 'ebitda_multiple', 'adjusted_nav']), [])
    ).toEqual({
      methods: ['dcf', 'ebitda_multiple', 'adjusted_nav'],
      weights: { dcf: 34, ebitda_multiple: 33, adjusted_nav: 33 },
    })
  })

  it('falls back instead of inventing weights for ambiguous choices', () => {
    expect(
      parseAgentMethodWeightChoice(single('optimistic'), ['dcf', 'ebitda_multiple'])
    ).toBeNull()
  })

  it('falls back instead of silently equalizing invalid explicit weight sums', () => {
    expect(parseAgentMethodWeightChoice(single('dcf=60, ebitda_multiple=30'), [])).toBeNull()
  })

  it('builds localized follow-up prompts for choices that still need the agent loop', () => {
    expect(buildAgentChoiceFollowUpPrompt(single('base', 'Base case'), 'en')).toBe(
      'For "Pick weights", I choose: Base case. Continue with this selection.'
    )
    expect(buildAgentChoiceFollowUpPrompt(single('base', 'Basisscenario'), 'nl')).toBe(
      'Voor "Pick weights" kies ik: Basisscenario. Ga verder met deze keuze.'
    )
  })

  it('maps valuation scenario choices to preparer multiple presets', () => {
    expect(parseAgentValuationScenarioChoice(single('strategic_buyer'), 4)).toEqual({
      appliedMedian: 5,
      reasonKey: 'strategic_buyer_premium',
    })
  })

  it('maps base scenario choices to a benchmark reset', () => {
    expect(parseAgentValuationScenarioChoice(single('base'), 4)).toEqual({
      appliedMedian: 4,
      reasonKey: '',
    })
  })

  it('does not apply premium/discount scenarios before a benchmark exists', () => {
    expect(parseAgentValuationScenarioChoice(single('distressed'), null)).toBeNull()
  })
})
