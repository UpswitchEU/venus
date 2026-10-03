import { describe, expect, it } from 'vitest'
import type { ValuationSession } from '../types/valuation'
import { extractValuationAmount } from './valuationSessionMapper'

describe('valuationSessionMapper', () => {
  it('preserves a saved zero headline amount rather than pricing the range midpoint', () => {
    const session = {
      valuationResult: {
        equity_value_mid: 0,
        equity_value_low: 12_800_000,
        equity_value_high: 18_400_000,
        recommended_asking_price: 0,
      },
    } as ValuationSession

    expect(extractValuationAmount(session)).toBe(0)
  })
})
