import { describe, expect, it } from 'vitest'

import {
  clearMercurySessionPrefillSuppression,
  markMercurySessionPrefillSuppressed,
  shouldSuppressMercurySessionPrefill,
} from '../prefillRestorationGate'

describe('prefillRestorationGate', () => {
  it('does not suppress without mark', () => {
    clearMercurySessionPrefillSuppression()
    expect(shouldSuppressMercurySessionPrefill('r1')).toBe(false)
  })

  it('suppresses for matching report id', () => {
    clearMercurySessionPrefillSuppression()
    markMercurySessionPrefillSuppressed('r1')
    expect(shouldSuppressMercurySessionPrefill('r1')).toBe(true)
    expect(shouldSuppressMercurySessionPrefill('r2')).toBe(false)
  })

  it('ignores new and empty report ids', () => {
    clearMercurySessionPrefillSuppression()
    markMercurySessionPrefillSuppressed('r1')
    expect(shouldSuppressMercurySessionPrefill(undefined)).toBe(false)
    expect(shouldSuppressMercurySessionPrefill('new')).toBe(false)
  })

  it('clearMercurySessionPrefillSuppression clears all when no id', () => {
    markMercurySessionPrefillSuppressed('r1')
    clearMercurySessionPrefillSuppression()
    expect(shouldSuppressMercurySessionPrefill('r1')).toBe(false)
  })

  it('clearMercurySessionPrefillSuppression clears only matching id', () => {
    markMercurySessionPrefillSuppressed('r1')
    clearMercurySessionPrefillSuppression('r1')
    expect(shouldSuppressMercurySessionPrefill('r1')).toBe(false)
  })
})
