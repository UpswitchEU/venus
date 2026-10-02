import { describe, expect, it } from 'vitest'
import {
  getEquityValueMid,
  getFinalValuation,
  getRawFinalValuation,
  getRecommendedAskingPrice,
} from './valuationResultAccess'

describe('valuationResultAccess', () => {
  it.each([
    null,
    undefined,
    true,
    false,
    [],
    {},
    '1,000',
    '0x10',
  ])('does not coerce invalid transport amounts %j', (value) => {
    expect(getFinalValuation({ equity_value_mid: value })).toBeNull()
  })
  it('retains an explicit loss and does not manufacture an unpriced range midpoint', () => {
    expect(getFinalValuation({ equity_value_mid: '-20.25' })).toBe(-20.25)
    expect(getFinalValuation({ equity_value_low: 100, equity_value_high: 200 })).toBeNull()
    expect(getEquityValueMid({ value: 100, value_basis: 'enterprise_value' })).toBeNull()
  })
  it('preserves the zero conclusion when a conflicting positive range is present', () => {
    const result = {
      recommended_asking_price: 0,
      equity_value_mid: 0,
      equity_value_low: 12_800_000,
      equity_value_high: 18_400_000,
      valuation_summary: { final_valuation: 0 },
    }

    expect(getFinalValuation(result)).toBe(0)
    expect(getEquityValueMid(result)).toBe(0)
    expect(getRawFinalValuation(result)).toBe(0)
  })

  it('retains zero-valued snapshots', () => {
    const result = {
      recommended_asking_price: 0,
      equity_value_mid: 0,
      equity_value_low: 0,
      equity_value_high: 0,
      valuation_summary: { final_valuation: 0, recommended_asking_price: 0 },
    }

    expect(getFinalValuation(result)).toBe(0)
    expect(getEquityValueMid(result)).toBe(0)
    expect(getRecommendedAskingPrice(result)).toBe(0)
  })

  it('does not replace an explicit zero asking price with another source', () => {
    expect(
      getRecommendedAskingPrice({
        recommended_asking_price: 0,
        valuation_summary: { recommended_asking_price: 617_000 },
      })
    ).toBe(0)
  })
})
