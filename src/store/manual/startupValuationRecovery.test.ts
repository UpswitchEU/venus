import { describe, expect, it } from 'vitest'
import { INITIAL_STARTUP_VALUATION_STATE } from './startupValuationInitialState'
import { isStartupRecoveryState } from './startupValuationRecovery'

describe('startup recovery validation', () => {
  it('accepts complete inputs including optional cap-table notes and evidence', () => {
    expect(isStartupRecoveryState(INITIAL_STARTUP_VALUATION_STATE)).toBe(true)
    expect(
      isStartupRecoveryState({
        ...INITIAL_STARTUP_VALUATION_STATE,
        description: 'A startup draft',
        exit_revenue_multiple_rationale: 'Sector assumption',
        pedigree_evidence: { prior_exit: 'Evidence' },
        cap_table: {
          ...INITIAL_STARTUP_VALUATION_STATE.cap_table,
          safe_notes: [
            {
              id: 'note',
              amount: 200,
              valuation_cap: null,
              discount_pct: 20,
              holder_label: 'Founder',
            },
          ],
        },
      })
    ).toBe(true)
  })

  it.each([
    { mrr: '123' },
    { mrr: Infinity },
    { reset: 'injected' },
    { pedigree_evidence: { unknown: 'bad' } },
    { cap_table: { ...INITIAL_STARTUP_VALUATION_STATE.cap_table, safe_notes: [null] } },
    { description: 'x'.repeat(10_001) },
  ])('rejects corrupt, unexpected or unbounded state %j', (patch) => {
    expect(isStartupRecoveryState({ ...INITIAL_STARTUP_VALUATION_STATE, ...patch })).toBe(false)
  })
})
