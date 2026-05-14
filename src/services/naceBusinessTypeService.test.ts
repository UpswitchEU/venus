import { describe, expect, it } from 'vitest'
import { isLegalFormBusinessTypeValue, looksLikeNaceCode } from './naceBusinessTypeService'

describe('looksLikeNaceCode', () => {
  it('accepts dotted NACE codes', () => {
    expect(looksLikeNaceCode('56.101')).toBe(true)
    expect(looksLikeNaceCode('62.01')).toBe(true)
  })

  it('accepts compact numeric NACE codes used in search input', () => {
    expect(looksLikeNaceCode('56101')).toBe(true)
    expect(looksLikeNaceCode('6201')).toBe(true)
  })

  it('rejects non-NACE values', () => {
    expect(looksLikeNaceCode('mix-media')).toBe(false)
    expect(looksLikeNaceCode('abc123')).toBe(false)
  })
})

describe('isLegalFormBusinessTypeValue', () => {
  it('detects legal structure values that must not become business_type_id', () => {
    expect(isLegalFormBusinessTypeValue('company')).toBe(true)
    expect(isLegalFormBusinessTypeValue('BV')).toBe(true)
    expect(isLegalFormBusinessTypeValue('limited liability company')).toBe(true)
  })

  it('does not flag sector ids', () => {
    expect(isLegalFormBusinessTypeValue('restaurant')).toBe(false)
    expect(isLegalFormBusinessTypeValue('consulting-it')).toBe(false)
  })
})
