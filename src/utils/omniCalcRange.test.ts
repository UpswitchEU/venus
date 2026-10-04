import { describe, expect, it } from 'vitest'
import { getOmniMethodEquityRange, getOmniMethodRange } from './omniCalcRange'

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

  it.each([
    { equity_value_low: 0, equity_value_high: 20, value_low: 1, value_high: 20 },
    { value_low: 0, value_high: 20, details: { equity_low: 0, equity_high: 30 } },
    { value_low: 0, value_high: 20, details: { equity_low: 0 } },
    { value_low: 0, value_high: 20, details: { equity_low: '0x0', equity_high: 20 } },
  ])('withholds conflicting or corrupt secondary equity evidence %#', (input) => {
    expect(getOmniMethodEquityRange({ available: true, value: 10, ...input })).toBeNull()
  })

  it('accepts agreeing decimal aliases for the same published range', () => {
    expect(
      getOmniMethodEquityRange({
        available: true,
        value: 10,
        value_low: 0,
        value_high: 20.05,
        details: { equity_low: '0.00', equity_high: '20.050' },
      })
    ).toEqual({ low: 0, high: 20.05, source: 'model' })
  })

  it.each([
    { enterprise_value_low: 0, enterprise_value_high: 30 },
    { enterprise_range_low: 0 },
    { enterprise_value_low: 'invalid', enterprise_value_high: 20 },
  ])('withholds conflicting or corrupt enterprise evidence %#', (details) => {
    expect(
      getOmniMethodRange({
        available: true,
        value_basis: 'enterprise_value',
        value: 10,
        value_low: 0,
        value_high: 20,
        details,
      })
    ).toBeNull()
  })

  it('does not compare an enterprise band against separate equity endpoints', () => {
    expect(
      getOmniMethodRange({
        available: true,
        value_basis: 'enterprise_value',
        value: 10,
        value_low: 0,
        value_high: 20,
        equity_value_low: -50,
        equity_value_high: -30,
      })
    ).toEqual({ low: 0, high: 20, source: 'model' })
  })
})
