import { describe, expect, it } from 'vitest'
import { normalizeSessionData } from '../SessionNormalizer'

describe('normalizeSessionData', () => {
  it('does not fabricate historical years from current year data', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_123',
      session_data: {
        company_name: 'Draft Co',
        current_year_data: {
          year: 2025,
          revenue: 1000000,
          ebitda: 100000,
        },
      },
    })

    expect(normalized.formData.current_year_data).toEqual({
      year: 2025,
      revenue: 1000000,
      ebitda: 100000,
    })
    expect(normalized.formData.historical_years_data).toBeUndefined()
    expect(normalized.formData.revenue).toBe(1000000)
    expect(normalized.formData.ebitda).toBe(100000)
  })

  it('normalizes year_data into oldest-to-newest historical years', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_456',
      session_data: {
        year_data: {
          2024: { revenue: 950000, ebitda: 95000 },
          2022: { revenue: 750000, ebitda: 75000 },
          2023: { revenue: 850000, ebitda: 85000 },
        },
      },
    })

    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2022, revenue: 750000, ebitda: 75000 },
      { year: 2023, revenue: 850000, ebitda: 85000 },
      { year: 2024, revenue: 950000, ebitda: 95000 },
    ])
  })
})
