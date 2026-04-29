import { describe, expect, it } from 'vitest'

import type { ValuationFormData as VenusFormData } from '../../types/valuation'
import { storeReflectsBridgeMapped } from '../storeReflectsBridgeMapped'

function minimalStore(overrides: Partial<VenusFormData> = {}): VenusFormData {
  return {
    company_name: '',
    country_code: 'BE',
    industry: 'services',
    founding_year: 2020,
    shares_for_sale: 100,
    business_type: 'company',
    ...overrides,
  } as VenusFormData
}

describe('storeReflectsBridgeMapped', () => {
  it('returns true when mapped partial equals store slice', () => {
    const current = minimalStore({ dcf_wacc_pct: 12.5, industry: 'retail' })
    const mapped: Partial<VenusFormData> = { dcf_wacc_pct: 12.5, industry: 'retail' }
    expect(storeReflectsBridgeMapped(mapped, current)).toBe(true)
  })

  it('returns false when any mapped field differs', () => {
    const current = minimalStore({ dcf_wacc_pct: 12.5 })
    const mapped: Partial<VenusFormData> = { dcf_wacc_pct: 13 }
    expect(storeReflectsBridgeMapped(mapped, current)).toBe(false)
  })

  it('compares nested arrays deeply', () => {
    const fy = [
      {
        year: 2026,
        revenue: 100,
        ebitda: 20,
        isForecast: true,
      },
    ]
    const current = minimalStore({ forecast_years_data: fy })
    expect(storeReflectsBridgeMapped({ forecast_years_data: fy }, current)).toBe(true)
    expect(
      storeReflectsBridgeMapped({ forecast_years_data: [{ ...fy[0], revenue: 99 }] }, current)
    ).toBe(false)
  })
})
