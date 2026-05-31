import { describe, expect, it } from 'vitest'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'

describe('normalizeBusinessTypeId', () => {
  it('canonicalizes legacy fintech lending ids', () => {
    expect(normalizeBusinessTypeId('fintech-lending-credit')).toBe('fintech-lending')
    expect(normalizeBusinessTypeId('fintech_lending_credit')).toBe('fintech-lending')
  })

  it('trims and preserves unknown canonical ids', () => {
    expect(normalizeBusinessTypeId(' consulting ')).toBe('consulting')
    expect(normalizeBusinessTypeId('')).toBeUndefined()
    expect(normalizeBusinessTypeId(null)).toBeUndefined()
  })
})
