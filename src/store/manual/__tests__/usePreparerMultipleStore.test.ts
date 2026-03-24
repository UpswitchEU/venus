import { beforeEach, describe, expect, it } from 'vitest'
import { usePreparerMultipleStore } from '../usePreparerMultipleStore'

describe('usePreparerMultipleStore', () => {
  beforeEach(() => {
    usePreparerMultipleStore.setState({
      benchmarkMedian: null,
      appliedMedian: null,
      reasonKey: '',
      note: '',
      acknowledgedExtreme: false,
    })
  })

  it('rehydrates saved multiple adjustment summary from persisted results', () => {
    usePreparerMultipleStore.getState().syncFromValuationResult({
      multiples_valuation: {
        ebitda_multiple: 4.8,
        unadjusted_ebitda_multiple: 5.1,
      },
      multiple_adjustment_summary: {
        benchmark_multiple: 5.1,
        selected_multiple: 4.8,
        reason_key: 'customer_concentration',
        free_text_reason: 'Large customer renewal is still pending.',
        acknowledged_extreme: true,
      },
    })

    const state = usePreparerMultipleStore.getState()
    expect(state.benchmarkMedian).toBe(5.1)
    expect(state.appliedMedian).toBe(4.8)
    expect(state.reasonKey).toBe('customer_concentration')
    expect(state.note).toBe('Large customer renewal is still pending.')
    expect(state.acknowledgedExtreme).toBe(true)
  })
})
