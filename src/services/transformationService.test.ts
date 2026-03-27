import { afterEach, describe, expect, it, vi } from 'vitest'
import { transformRegistryDataToValuationRequest } from './transformationService'
import type { CompanyFinancialData } from '../types/registry'

const baseRegistryData: CompanyFinancialData = {
  company_id: 'be-123',
  company_name: 'Registry Co',
  registration_number: '0123456789',
  country_code: 'BE',
  legal_form: 'BV',
  industry_description: 'Software',
  founding_year: 2010,
  employees: 12,
  filing_history: [
    { year: 2025, revenue: 1_050_000, ebitda: 105_000, filing_date: '2026-03-01' },
    { year: 2024, revenue: 950_000, ebitda: 95_000, filing_date: '2025-03-01' },
    { year: 2023, revenue: 850_000, ebitda: 85_000, filing_date: '2024-03-01' },
  ],
  data_source: 'registry',
  last_updated: '2026-03-27T12:00:00Z',
  completeness_score: 0.9,
}

describe('transformRegistryDataToValuationRequest', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops future filing rows in H1 and anchors the request to the filing year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    const result = transformRegistryDataToValuationRequest(baseRegistryData)

    expect(result.current_year_data).toMatchObject({
      year: 2024,
      revenue: 950_000,
      ebitda: 95_000,
    })
    expect(result.historical_years_data).toEqual([
      expect.objectContaining({
        year: 2023,
        revenue: 850_000,
        ebitda: 85_000,
      }),
    ])
  })

  it('refuses transformation when no filing-safe registry year exists', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    expect(() =>
      transformRegistryDataToValuationRequest({
        ...baseRegistryData,
        filing_history: [
          { year: 2025, revenue: 1_050_000, ebitda: 105_000, filing_date: '2026-03-01' },
        ],
      })
    ).toThrow('No filing-safe financial data available for transformation. Please use manual entry.')
  })
})
