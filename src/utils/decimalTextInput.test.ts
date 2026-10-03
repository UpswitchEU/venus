import { describe, expect, it } from 'vitest'
import {
  normalizeDecimalSeparators,
  parseDecimalText,
  parseDecimalTextInput,
} from './decimalTextInput'

describe('normalizeDecimalSeparators', () => {
  it('maps decimal comma to dot when comma is last separator', () => {
    expect(normalizeDecimalSeparators('2,5')).toBe('2.5')
    expect(normalizeDecimalSeparators('12,25')).toBe('12.25')
  })

  it('handles Belgian thousands + decimal comma', () => {
    expect(normalizeDecimalSeparators('1.234,5')).toBe('1234.5')
  })
})

describe('parseDecimalTextInput', () => {
  it('parses trailing dot as partial number', () => {
    expect(parseDecimalTextInput('2.')).toBe(2)
    expect(parseDecimalTextInput('12.')).toBe(12)
  })

  it('parses comma decimals', () => {
    expect(parseDecimalTextInput('2,5')).toBe(2.5)
  })

  it('parses negative percentages', () => {
    expect(parseDecimalTextInput('-2.5')).toBe(-2.5)
    expect(parseDecimalTextInput('-2,5')).toBe(-2.5)
  })

  it('returns undefined for empty or incomplete', () => {
    expect(parseDecimalTextInput('')).toBeUndefined()
    expect(parseDecimalTextInput('.')).toBeUndefined()
    expect(parseDecimalTextInput('-')).toBeUndefined()
    expect(parseDecimalTextInput('-.')).toBeUndefined()
  })

  it('rejects invalid text', () => {
    expect(parseDecimalTextInput('abc')).toBeUndefined()
  })

  it.each([
    '12abc',
    '1.2.3',
    '1,23,4',
    '1e309',
    '0x20',
    'Infinity',
    '9007199254740993.01',
  ])('never partially parses or rounds %s in the legacy numeric adapter', (raw) =>
    expect(parseDecimalTextInput(raw)).toBeUndefined())

  it('recognizes valid English grouping without truncation', () => {
    expect(parseDecimalTextInput('1,000.25')).toBe(1000.25)
  })

  it('preserves exact money and resolves grouping using the selected locale', () => {
    expect(parseDecimalText('9,007,199,254,740,993.01', 'en')).toBe('9007199254740993.01')
    expect(parseDecimalText('1,000', 'en')).toBe('1000')
    expect(parseDecimalText('1,000', 'nl')).toBe('1')
    expect(parseDecimalText('1.000,25', 'nl')).toBe('1000.25')
    expect(parseDecimalText('1\u202f000,25', 'fr')).toBe('1000.25')
    expect(parseDecimalText('1.000.25', 'nl')).toBeUndefined()
    expect(parseDecimalText('0.000000001', 'en')).toBeUndefined()
    expect(parseDecimalText('1000000000000000000', 'en')).toBeUndefined()
  })
})
