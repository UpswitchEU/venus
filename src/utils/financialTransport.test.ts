import { describe, expect, it } from 'vitest'
import { parseFinancialTransportNumber } from './financialTransport'

describe('financial transport number parsing', () => {
  it.each([
    ['125.000', 125],
    ['125.125', 125.125],
    ['0', 0],
    ['-25.01', -25.01],
    ['1e6', 1_000_000],
    [0, 0],
  ] as const)('preserves decimal transport %s as %s', (value, expected) => {
    expect(parseFinancialTransportNumber(value)).toBe(expected)
  })
  it.each([
    null,
    undefined,
    '',
    ' ',
    false,
    true,
    [],
    {},
    '0x10',
    '1,000',
    '€100',
    'NaN',
    'Infinity',
    '1e999',
  ])('rejects nonnumeric transport %j', (value) => {
    expect(parseFinancialTransportNumber(value)).toBeUndefined()
  })
})
// Numeric presentation cannot preserve subnormal decimal amounts. Keep their absence explicit.
it.each([
  '1e-9999',
  '-1e-9999',
])('does not turn underflowing nonzero %s into observed zero', (value) => {
  expect(parseFinancialTransportNumber(value)).toBeUndefined()
})
