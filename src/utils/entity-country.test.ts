// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  getLegalFormOptions,
  LEGAL_FORMS_BY_COUNTRY,
  normalizeLegalForm,
} from '@upswitch/types/entity-country'
import { deriveNavPricesForVersionNav } from '../features/manual/components/manualReportPresentation'
import type { ValuationResponse } from '../types/valuation'

describe('country-aware legal identity', () => {
  it('offers forms for every supported country, with explicit other/unknown choices', () => {
    expect(Object.keys(LEGAL_FORMS_BY_COUNTRY)).toHaveLength(20)
    for (const country of Object.keys(LEGAL_FORMS_BY_COUNTRY)) {
      const values = getLegalFormOptions(country).map((form) => form.value)
      expect(values.length).toBeGreaterThan(2)
      expect(new Set(values).size).toBe(values.length)
      expect(values).toEqual(expect.arrayContaining(['other', 'unknown']))
    }
  })
  it('recognizes French registry aliases without mapping them to Belgian forms', () => {
    expect(normalizeLegalForm('FR', '5499')).toBe('sarl')
    expect(normalizeLegalForm('FR', 'Société à responsabilité limitée')).toBe('sarl')
    expect(normalizeLegalForm('FR', 'BV')).toBeNull()
    expect(getLegalFormOptions('FR').some((form) => form.value === 'bv')).toBe(false)
    expect(normalizeLegalForm('NL', 'Commanditaire vennootschap')).toBe('cv')
    expect(normalizeLegalForm('NL', 'Coöperatie')).toBe('cooperatie')
  })
})

describe('persisted conclusion navigation', () => {
  const conclusion = {
    schema_version: 'valuation_conclusion.v1',
    selected_method: 'upswitch_adaptive',
    value_basis: 'enterprise_value',
    currency: 'EUR',
    low: '274000',
    mid: '354000',
    high: '435000',
  }
  it('shows central EV and range from both fresh and hydrated results without asking price', () => {
    for (const payload of [
      { valuation_conclusion: conclusion },
      { details: { valuation_conclusion: conclusion } },
    ]) {
      expect(
        deriveNavPricesForVersionNav(payload as unknown as ValuationResponse, 'upswitch_adaptive')
      ).toMatchObject({
        valuation: 354000,
        currency: 'EUR',
        valueBasis: 'enterprise_value',
        priceRange: { min: 274000, max: 435000 },
      })
    }
  })
  it('does not conceal an invalid authoritative range behind legacy values', () => {
    expect(
      deriveNavPricesForVersionNav(
        {
          equity_value_mid: 354000,
          valuation_conclusion: { ...conclusion, high: '10' },
        } as unknown as ValuationResponse,
        'upswitch_adaptive'
      )
    ).toBeNull()
  })
})
