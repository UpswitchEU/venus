import { describe, expect, it } from 'vitest'
import { getAnnualFictiveRentDeductionForDisplay } from './realEstateCarveOutDisplay'

describe('getAnnualFictiveRentDeductionForDisplay', () => {
  it('returns 0 when carve-out is off', () => {
    expect(getAnnualFictiveRentDeductionForDisplay(false, 10_000)).toBe(0)
    expect(getAnnualFictiveRentDeductionForDisplay(undefined, 10_000)).toBe(0)
  })

  it('returns 0 when rent missing or non-positive', () => {
    expect(getAnnualFictiveRentDeductionForDisplay(true, undefined)).toBe(0)
    expect(getAnnualFictiveRentDeductionForDisplay(true, null)).toBe(0)
    expect(getAnnualFictiveRentDeductionForDisplay(true, 0)).toBe(0)
    expect(getAnnualFictiveRentDeductionForDisplay(true, -100)).toBe(0)
  })

  it('returns annual rent when carve-out is on and rent is positive', () => {
    expect(getAnnualFictiveRentDeductionForDisplay(true, 10_000)).toBe(10_000)
    expect(getAnnualFictiveRentDeductionForDisplay(true, 24_000.5)).toBe(24_000.5)
  })
})
