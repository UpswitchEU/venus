import { describe, expect, it } from 'vitest'

import { mergeSessionSurfaceForOptionalPrefill } from '../mergeOptionalSessionPrefillFields'

describe('mergeSessionSurfaceForOptionalPrefill', () => {
  it('does not let top-level empty string mask company_name on the business card', () => {
    const m = mergeSessionSurfaceForOptionalPrefill({
      company_name: '',
      _businessInfo: { company_name: 'Acme BV', kbo_number: '0123456789' },
    })
    expect(m.company_name).toBe('Acme BV')
    expect(m.kbo_number).toBe('0123456789')
  })

  it('keeps a non-empty top-level value when both top and card differ', () => {
    const m = mergeSessionSurfaceForOptionalPrefill({
      company_name: 'Top Co',
      _businessInfo: { company_name: 'Card Co' },
    })
    expect(m.company_name).toBe('Top Co')
  })

  it('fills historical_years_data from the card when top-level is an empty array', () => {
    const hist = [{ year: 2022, revenue: 1, ebitda: 1 }]
    const m = mergeSessionSurfaceForOptionalPrefill({
      historical_years_data: [],
      _businessInfo: { historical_years_data: hist },
    })
    expect(m.historical_years_data).toEqual(hist)
  })

  it('fills year_data from the card when top-level map is empty', () => {
    const yd = { '2022': { revenue: 1, ebitda: 1 } }
    const m = mergeSessionSurfaceForOptionalPrefill({
      year_data: {},
      _businessInfo: { year_data: yd },
    })
    expect(m.year_data).toEqual(yd)
  })
})
