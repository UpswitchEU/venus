import { describe, expect, it } from 'vitest'
import {
  getCompleteYearlyFinancialsDesc,
  getHistoricalYearRange,
  getLatestCompleteYearlyFinancial,
  historicalYearRowNeedsRemovalWarning,
  isCompleteYearlyFinancial,
} from '../yearlyFinancials'

describe('yearlyFinancials helpers', () => {
  it('treats a year as complete only when revenue is positive and EBITDA is numeric', () => {
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 1_000_000, ebitda: 100_000 })).toBe(true)
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 0, ebitda: 100_000 })).toBe(false)
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 1_000_000, ebitda: null })).toBe(false)
  })

  it('picks the latest complete year instead of the first placeholder row', () => {
    const yearlyFinancials = [
      { year: '2025', revenue: 0, ebitda: 0 },
      { year: '2024', revenue: 1_500_000, ebitda: 250_000 },
      { year: '2023', revenue: 1_000_000, ebitda: 100_000 },
    ]

    expect(getLatestCompleteYearlyFinancial(yearlyFinancials)).toEqual({
      year: '2024',
      revenue: 1_500_000,
      ebitda: 250_000,
    })
    expect(getCompleteYearlyFinancialsDesc(yearlyFinancials)).toEqual([
      { year: '2024', revenue: 1_500_000, ebitda: 250_000 },
      { year: '2023', revenue: 1_000_000, ebitda: 100_000 },
    ])
  })

  it('builds default historical years from the filing-year base', () => {
    expect(getHistoricalYearRange(2024, 3)).toEqual([2024, 2023, 2022])
    expect(getHistoricalYearRange(2025, 3)).toEqual([2025, 2024, 2023])
  })

  it('supports offset ranges for prior historical inputs', () => {
    expect(getHistoricalYearRange(2024, 2, 1)).toEqual([2023, 2022])
    expect(getHistoricalYearRange(2025, 2, 1)).toEqual([2024, 2023])
  })

  describe('historicalYearRowNeedsRemovalWarning', () => {
    it('is false for default-like empty row (0 revenue, 0 ebitda, no norms)', () => {
      expect(
        historicalYearRowNeedsRemovalWarning({ revenue: 0, ebitda: 0 }, 0)
      ).toBe(false)
    })

    it('is true when revenue is positive', () => {
      expect(historicalYearRowNeedsRemovalWarning({ revenue: 1, ebitda: 0 }, 0)).toBe(true)
    })

    it('is true when EBITDA is non-zero', () => {
      expect(historicalYearRowNeedsRemovalWarning({ revenue: 0, ebitda: -5000 }, 0)).toBe(true)
    })

    it('is true when normalizations are bound to the year', () => {
      expect(historicalYearRowNeedsRemovalWarning({ revenue: 0, ebitda: 0 }, 1)).toBe(true)
    })
  })
})
