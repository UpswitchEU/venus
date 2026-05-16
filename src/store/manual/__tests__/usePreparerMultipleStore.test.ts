import { beforeEach, describe, expect, it } from 'vitest'
import preparerMultipleContract from '../../../../../../tests/contracts/preparer-multiple-contract.json'
import {
  buildPersistedPreparerMultiplePayload,
  buildPreparerMultiplePayload,
  PREPARER_EBITDA_REASON_KEYS,
  usePreparerMultipleStore,
} from '../usePreparerMultipleStore'

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

  it('keeps the reason-key picker aligned with the shared contract fixture', () => {
    expect([...PREPARER_EBITDA_REASON_KEYS]).toEqual(preparerMultipleContract.reasonKeys)
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

  it('builds the same preparer payload used by recalculation and modal autosave', () => {
    const payload = buildPreparerMultiplePayload({
      benchmarkMedian: 5.1,
      appliedMedian: 4.8,
      reasonKey: 'customer_concentration',
      note: 'Large customer renewal is still pending.',
      acknowledgedExtreme: true,
    })

    expect(payload).toEqual({
      preparer_ev_ebitda_median: 4.8,
      preparer_ev_ebitda_override: {
        reason_key: 'customer_concentration',
        note: 'Large customer renewal is still pending.',
        acknowledged_extreme: true,
      },
    })
  })

  it('returns null persisted payload when the saved summary no longer has an active override', () => {
    expect(
      buildPersistedPreparerMultiplePayload({
        multiple_adjustment_summary: {
          benchmark_multiple: 5.1,
          selected_multiple: 5.1,
          reason_key: null,
        },
      })
    ).toBeNull()
  })
})
