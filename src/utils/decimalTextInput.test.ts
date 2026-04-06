import { describe, expect, it } from 'vitest'
import { normalizeDecimalSeparators, parseDecimalTextInput } from './decimalTextInput'

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
})
