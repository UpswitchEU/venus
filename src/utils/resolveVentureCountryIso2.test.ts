import { beforeEach, describe, expect, it } from 'vitest'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import type { ValuationFormData } from '@/types/valuation'
import { coerceIso2OrNull } from './coerceIso2Country'
import { resolveVentureCountryIso2 } from './resolveVentureCountryIso2'

describe('coerceIso2OrNull', () => {
  it('maps UK to GB', () => {
    expect(coerceIso2OrNull('uk')).toBe('GB')
  })

  it('returns null for whitespace-only input', () => {
    expect(coerceIso2OrNull('  ')).toBeNull()
  })

  it('truncates longer tokens to two letters', () => {
    expect(coerceIso2OrNull('bel')).toBe('BE')
  })
})

describe('resolveVentureCountryIso2', () => {
  beforeEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('maps UK registry shorthand to GB (ISO-3166)', () => {
    const fd = { country_code: 'UK' } as ValuationFormData
    expect(resolveVentureCountryIso2(fd)).toBe('GB')
  })

  it('prefers a populated form country over the studio default', () => {
    useStartupValuationStore.getState().setField('country_code', 'BE')
    const fd = { country_code: 'NL' } as ValuationFormData
    expect(resolveVentureCountryIso2(fd)).toBe('NL')
  })

  it('falls back to the studio store when the form country is blank', () => {
    useStartupValuationStore.getState().setField('country_code', 'LU')
    const fd = { country_code: '' } as ValuationFormData
    expect(resolveVentureCountryIso2(fd)).toBe('LU')
  })
})
