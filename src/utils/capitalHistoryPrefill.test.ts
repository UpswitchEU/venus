/**
 * capitalHistoryPrefill — sessionStorage round-trip contract.
 *
 * Pins the Studio → SaaS hand-off so a regression that quietly drops
 * the founder's pre-typed round size on the floor (Wintercircus would
 * never know) is caught at unit-test time.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type CapitalHistoryPrefill,
  consumeCapitalHistoryPrefill,
  writeCapitalHistoryPrefill,
} from './capitalHistoryPrefill'

const STORAGE_KEY = 'venus_studio_to_saas_capital_prefill'

describe('capitalHistoryPrefill', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('writes a snapshot that consume can read back verbatim', () => {
    const payload: CapitalHistoryPrefill = {
      round_amount: 750_000,
      dilution_pct: 65,
      source: 'studio',
    }
    writeCapitalHistoryPrefill(payload)
    expect(consumeCapitalHistoryPrefill()).toEqual(payload)
  })

  it('consume clears the snapshot — second call returns null', () => {
    writeCapitalHistoryPrefill({ round_amount: 500_000, dilution_pct: 70, source: 'studio' })
    expect(consumeCapitalHistoryPrefill()).not.toBeNull()
    expect(consumeCapitalHistoryPrefill()).toBeNull()
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null when nothing was queued', () => {
    expect(consumeCapitalHistoryPrefill()).toBeNull()
  })

  it('returns null and drops the entry when the snapshot is malformed JSON', () => {
    window.sessionStorage.setItem(STORAGE_KEY, 'not-json')
    expect(consumeCapitalHistoryPrefill()).toBeNull()
    // Defensive — corrupt entries must not survive a consume call.
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('returns null when both numeric fields are missing or non-numeric', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ round_amount: 'not-a-number', dilution_pct: null, source: 'studio' })
    )
    expect(consumeCapitalHistoryPrefill()).toBeNull()
  })

  it('coerces partial snapshots — keeps round, drops dilution when absent', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ round_amount: 250_000, source: 'studio' })
    )
    expect(consumeCapitalHistoryPrefill()).toEqual({
      round_amount: 250_000,
      dilution_pct: null,
      source: 'studio',
    })
  })

  it('rejects NaN and Infinity (numeric but not finite)', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ round_amount: Number.NaN, dilution_pct: Infinity, source: 'studio' })
    )
    expect(consumeCapitalHistoryPrefill()).toBeNull()
  })
})
