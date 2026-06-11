import { describe, expect, it } from 'vitest'
import {
  getEquityValueMid,
  getFinalValuation,
  getRawFinalValuation,
  getRecommendedAskingPrice,
} from './valuationResultAccess'

describe('valuationResultAccess', () => {
  it('infers final valuation from a positive range when headline values are zero', () => {
    const result = {
      recommended_asking_price: 0,
      equity_value_mid: 0,
      equity_value_low: 12_800_000,
      equity_value_high: 18_400_000,
      valuation_summary: { final_valuation: 0 },
    }

    expect(getFinalValuation(result)).toBe(15_600_000)
    expect(getEquityValueMid(result)).toBe(15_600_000)
    expect(getRawFinalValuation(result)).toBe(0)
  })

  it('omits zero-only valuation snapshots', () => {
    const result = {
      recommended_asking_price: 0,
      equity_value_mid: 0,
      equity_value_low: 0,
      equity_value_high: 0,
      valuation_summary: { final_valuation: 0, recommended_asking_price: 0 },
    }

    expect(getFinalValuation(result)).toBeNull()
    expect(getEquityValueMid(result)).toBeNull()
    expect(getRecommendedAskingPrice(result)).toBeNull()
  })

  it('ignores zero recommended asking prices', () => {
    expect(
      getRecommendedAskingPrice({
        recommended_asking_price: 0,
        valuation_summary: { recommended_asking_price: 617_000 },
      })
    ).toBe(617_000)
  })
})
