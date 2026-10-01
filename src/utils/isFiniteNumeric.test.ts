import { describe, expect, it } from 'vitest'
import { coerceFiniteNumber, isFiniteNumeric, parseFlexibleNumber } from './isFiniteNumeric'

describe('isFiniteNumeric', () => {
  it('accepts numbers and numeric strings', () => {
    expect(isFiniteNumeric(42)).toBe(true)
    expect(isFiniteNumeric('120000')).toBe(true)
  })

  it('parses Belgian, Dutch, and English formatted numbers', () => {
    expect(parseFlexibleNumber('1.000.000')).toBe(1_000_000)
    expect(parseFlexibleNumber('400.000')).toBe(400_000)
    expect(parseFlexibleNumber('1.234,56')).toBe(1234.56)
    expect(parseFlexibleNumber('1,234.56')).toBe(1234.56)
    expect(parseFlexibleNumber('10,5%')).toBe(10.5)
    expect(parseFlexibleNumber('€ 1 250 000')).toBe(1_250_000)
    expect(coerceFiniteNumber('4.92')).toBe(4.92)
  })

  it('rejects empty and non-numeric values', () => {
    expect(isFiniteNumeric(null)).toBe(false)
    expect(isFiniteNumeric('')).toBe(false)
    expect(isFiniteNumeric('n/a')).toBe(false)
    expect(isFiniteNumeric(Number.NaN)).toBe(false)
  })

  it('preserves exponents and rejects prose or malformed grouping', () => {
    expect(parseFlexibleNumber('1e6')).toBe(1000000)
    expect(parseFlexibleNumber('-2.5e3')).toBe(-2500)
    expect(parseFlexibleNumber('0.125')).toBe(0.125)
    expect(parseFlexibleNumber('0,125')).toBe(0.125)
    expect(parseFlexibleNumber('1e999')).toBeUndefined()
    for (const value of ['about 100', '100k', '1/2', '12.34,56', '1,23.45', '1€2']) {
      expect(parseFlexibleNumber(value)).toBeUndefined()
    }
    expect(parseFlexibleNumber('(€ 1.234,56)')).toBe(-1234.56)
  })
})
