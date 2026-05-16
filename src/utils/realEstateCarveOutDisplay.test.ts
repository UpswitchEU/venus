import { describe, expect, it } from 'vitest'
import {
  getAnnualFictiveRentDeductionForDisplay,
  REAL_ESTATE_CARVE_OUT_METHODS,
  realEstateCarveOutAppliesTo,
} from './realEstateCarveOutDisplay'

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

describe('realEstateCarveOutAppliesTo', () => {
  it('returns true for EBITDA-income methods', () => {
    expect(realEstateCarveOutAppliesTo(['ebitda_multiple'])).toBe(true)
    expect(realEstateCarveOutAppliesTo(['dcf'])).toBe(true)
    expect(realEstateCarveOutAppliesTo(['sde_multiple'])).toBe(true)
    expect(realEstateCarveOutAppliesTo(['upswitch_adaptive'])).toBe(true)
  })

  it('returns false for revenue-style methods (revenue/ARR not touched by engine)', () => {
    expect(realEstateCarveOutAppliesTo(['omzet_multiple'])).toBe(false)
    expect(realEstateCarveOutAppliesTo(['arr_multiple'])).toBe(false)
  })

  it('returns false for adjusted_nav (own real-estate appraisal section)', () => {
    expect(realEstateCarveOutAppliesTo(['adjusted_nav'])).toBe(false)
  })

  it('returns false for fiscal_4x / startup_valuation (no EBITDA bridge)', () => {
    expect(realEstateCarveOutAppliesTo(['fiscal_4x'])).toBe(false)
    expect(realEstateCarveOutAppliesTo(['startup_valuation'])).toBe(false)
  })

  it('returns false for liquidation_analysis (wind-down lens has own RE class)', () => {
    expect(realEstateCarveOutAppliesTo(['liquidation_analysis'])).toBe(false)
  })

  it('returns true if any selected method consumes the carve-out (mixed run)', () => {
    expect(realEstateCarveOutAppliesTo(['liquidation_analysis', 'ebitda_multiple'])).toBe(true)
    expect(realEstateCarveOutAppliesTo(['adjusted_nav', 'dcf'])).toBe(true)
  })

  it('returns false for empty / nullish inputs', () => {
    expect(realEstateCarveOutAppliesTo([])).toBe(false)
    expect(realEstateCarveOutAppliesTo(undefined)).toBe(false)
    expect(realEstateCarveOutAppliesTo(null)).toBe(false)
  })

  it('canonical applicable-method set matches the audit verdict', () => {
    // Pin: changes to this set should go through a fresh audit of the
    // engine paths (EBITDA carve-out + Step 7 BSA row consumption).
    expect([...REAL_ESTATE_CARVE_OUT_METHODS].sort()).toEqual([
      'dcf',
      'ebitda_multiple',
      'sde_multiple',
      'upswitch_adaptive',
    ])
  })
})
