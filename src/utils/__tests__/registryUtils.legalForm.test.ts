import { describe, expect, it } from 'vitest'

import { pickLegalFormFromRegistryHit } from '../registryUtils'

describe('pickLegalFormFromRegistryHit', () => {
  it('prefers legal_form when set', () => {
    expect(
      pickLegalFormFromRegistryHit({
        legal_form: 'BV',
        rechtsvorm: 'Besloten Vennootschap',
      })
    ).toBe('BV')
  })

  it('falls back to rechtsvorm when legal_form missing', () => {
    expect(
      pickLegalFormFromRegistryHit({
        rechtsvorm: 'Besloten Vennootschap',
      })
    ).toBe('Besloten Vennootschap')
  })

  it('falls back to rechtsvormOmschrijving', () => {
    expect(
      pickLegalFormFromRegistryHit({
        rechtsvormOmschrijving: 'Eenmanszaak',
      })
    ).toBe('Eenmanszaak')
  })

  it('accepts legalForm camelCase', () => {
    expect(pickLegalFormFromRegistryHit({ legalForm: 'VOF' })).toBe('VOF')
  })
})
