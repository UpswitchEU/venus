import { describe, expect, it } from 'vitest'
import { getOmniMethodEquityRange } from './omniCalcRange'

describe('method range integrity', () => {
  it.each([
    [-20.25, 0, 10.75],
    [0, 0, 0],
    [1.123, 1.5, 2.456],
  ])('preserves the published band %s / %s / %s', (low, value, high) => {
    expect(
      getOmniMethodEquityRange({
        available: true,
        value,
        details: { equity_range_low: low, equity_range_high: high },
      })
    ).toEqual({ low, high, source: 'model' })
  })
  it.each([
    { equity_range_low: 20, equity_range_high: 10 },
    { equity_range_low: 1, equity_range_high: 2 },
    { equity_range_low: true, equity_range_high: 20 },
    { equity_range_low: [1], equity_range_high: 20 },
    { equity_range_low: '1,000', equity_range_high: 20 },
    { equity_range_low: 1, equity_high: 20 },
    { equity_range_low: 'invalid', equity_range_high: 20, equity_low: 1, equity_high: 20 },
  ])('does not repair malformed or conflicting evidence %#', (details) => {
    expect(getOmniMethodEquityRange({ available: true, value: 10, details })).toBeNull()
  })
  it('accepts one complete legacy alias pair without rounding', () => {
    expect(
      getOmniMethodEquityRange({
        available: true,
        value: 10,
        details: { equity_low: '1.123', equity_high: '20.456' },
      })
    ).toEqual({ low: 1.123, high: 20.456, source: 'model' })
  })
})
