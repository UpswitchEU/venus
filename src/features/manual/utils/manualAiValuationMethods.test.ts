import { describe, expect, it } from 'vitest'
import { canonicalAgentMethodSelection } from './manualAiValuationMethods'

describe('canonicalAgentMethodSelection', () => {
  it('normalizes conversational method aliases to engine keys', () => {
    expect(
      canonicalAgentMethodSelection([
        'multiples',
        'Discounted Cash Flow',
        'orderly liquidation',
        'SaaS',
        'capital-gains-tax',
      ])
    ).toEqual(['ebitda_multiple', 'dcf', 'liquidation_analysis', 'arr_multiple', 'fiscal_4x'])
  })

  it('drops unknown values and duplicate canonical methods', () => {
    expect(
      canonicalAgentMethodSelection([
        'unknown',
        'dcf',
        'DCF',
        null,
        'forced_liquidation',
        'liquidation_analysis',
      ])
    ).toEqual(['dcf', 'liquidation_analysis'])
  })

  it('returns an empty selection for missing or all-invalid requests', () => {
    expect(canonicalAgentMethodSelection(null)).toEqual([])
    expect(canonicalAgentMethodSelection(['nope'])).toEqual([])
  })
})
