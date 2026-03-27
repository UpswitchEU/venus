import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '../../types/valuation'
import { resolveTrustComparisonUserFigures } from '../resolveTrustComparisonUserFigures'

describe('resolveTrustComparisonUserFigures', () => {
  it('prefers historical row matching official filing year', () => {
    const fd = {
      revenue: 5_000_000,
      ebitda: 500_000,
      historical_years_data: [
        { year: 2022, revenue: 4_000_000, ebitda: 400_000 },
        { year: 2023, revenue: 4_500_000, ebitda: 450_000 },
      ],
      current_year_data: { year: 2024, revenue: 5_000_000, ebitda: 500_000 },
    } as ValuationFormData

    const out = resolveTrustComparisonUserFigures(fd, 2023)
    expect(out.revenue).toBe(4_500_000)
    expect(out.ebitda).toBe(450_000)
  })

  it('uses current_year_data when year matches filing year', () => {
    const fd = {
      revenue: 1,
      ebitda: 2,
      historical_years_data: [],
      current_year_data: { year: 2023, revenue: 9_000_000, ebitda: 900_000 },
    } as ValuationFormData

    const out = resolveTrustComparisonUserFigures(fd, 2023)
    expect(out.revenue).toBe(9_000_000)
    expect(out.ebitda).toBe(900_000)
  })

  it('matches filing year when provided as numeric string', () => {
    const fd = {
      revenue: 1,
      ebitda: 2,
      historical_years_data: [{ year: '2023', revenue: 3_000_000, ebitda: 300_000 }],
      current_year_data: { year: 2024, revenue: 4, ebitda: 5 },
    } as ValuationFormData

    const out = resolveTrustComparisonUserFigures(fd, '2023')
    expect(out.revenue).toBe(3_000_000)
    expect(out.ebitda).toBe(300_000)
  })

  it('falls back to scalar bridge when no filing year match', () => {
    const fd = {
      revenue: 1_000_000,
      ebitda: 100_000,
      historical_years_data: [{ year: 2022, revenue: 2, ebitda: 3 }],
      current_year_data: { year: 2024, revenue: 4, ebitda: 5 },
    } as ValuationFormData

    const out = resolveTrustComparisonUserFigures(fd, 2023)
    expect(out.revenue).toBe(1_000_000)
    expect(out.ebitda).toBe(100_000)
  })
})
