import { describe, expect, it } from 'vitest'
import { ownershipMultiplierFromSharesForSale } from './ownershipMultiplier'

describe('ownershipMultiplierFromSharesForSale', () => {
  it('matches orchestrator: full sale → 1', () => {
    expect(ownershipMultiplierFromSharesForSale(100)).toBe(1)
    expect(ownershipMultiplierFromSharesForSale(undefined)).toBe(1)
  })

  it('uses shares/100 when below 100', () => {
    expect(ownershipMultiplierFromSharesForSale(50)).toBe(0.5)
  })

  it('returns 0 for non-positive stake', () => {
    expect(ownershipMultiplierFromSharesForSale(0)).toBe(0)
  })
})
