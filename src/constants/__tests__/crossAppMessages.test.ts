import { describe, expect, it } from 'vitest'
import { ENGINE_TO_MERCURY_MESSAGE_TYPES } from '../crossAppMessages'

/**
 * Producer-side contract-lock for the engine → Mercury postMessage envelope.
 *
 * Mercury's `VenusEmbeddedModal` and `VenusTransitionLoader` listen for
 * exactly these literal `event.data.type` values. If we rename a value here
 * without simultaneously updating
 * `apps/mercury/shared/constants/cross-app-messages.ts` AND deploying both
 * apps together, the embedded valuation flow silently breaks: the modal
 * spinner never resolves, "Done" never closes the dialog, and report
 * queries never refresh.
 */
describe('crossAppMessages producer contract', () => {
  it('engineReady is the canonical `venus-ready` wire token', () => {
    expect(ENGINE_TO_MERCURY_MESSAGE_TYPES.engineReady).toBe('venus-ready')
  })

  it('engineClose is the canonical `venus-close` wire token', () => {
    expect(ENGINE_TO_MERCURY_MESSAGE_TYPES.engineClose).toBe('venus-close')
  })

  it('valuationComplete is the canonical `venus-valuation-complete` wire token', () => {
    expect(ENGINE_TO_MERCURY_MESSAGE_TYPES.valuationComplete).toBe(
      'venus-valuation-complete'
    )
  })

  it('reportCreated is the canonical `upswitch-report-created` wire token', () => {
    expect(ENGINE_TO_MERCURY_MESSAGE_TYPES.reportCreated).toBe(
      'upswitch-report-created'
    )
  })

  it('all envelope wire tokens are unique (no double-binding by accident)', () => {
    const values = Object.values(ENGINE_TO_MERCURY_MESSAGE_TYPES)
    expect(new Set(values).size).toBe(values.length)
  })
})
