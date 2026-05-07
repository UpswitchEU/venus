import { describe, expect, it } from 'vitest'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  getCompleteYearlyFinancialsDesc,
  getHistoricalYearRange,
  getLatestCompleteYearlyFinancial,
  historicalYearRowNeedsRemovalWarning,
  isCompleteYearlyFinancial,
  yearlyFinancialRowHasNonPlaceholderData,
  yearlyFinancialsContainsNonPlaceholderData,
} from '../yearlyFinancials'

describe('yearlyFinancials helpers', () => {
  it('treats a year as complete when revenue and EBITDA are explicit and not both zero', () => {
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 1_000_000, ebitda: 100_000 })).toBe(
      true
    )
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 0, ebitda: 100_000 })).toBe(true)
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 1_000_000, ebitda: 0 })).toBe(true)
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 0, ebitda: 0 })).toBe(false)
    expect(isCompleteYearlyFinancial({ year: '2025', revenue: 1_000_000, ebitda: null })).toBe(
      false
    )
    expect(
      isCompleteYearlyFinancial({ year: '2025', revenue: 0, ebitda: 0, free_cash_flow: 50_000 })
    ).toBe(true)
    expect(
      isCompleteYearlyFinancial({ year: '2025', revenue: 0, ebitda: 0, free_cash_flow: 0 })
    ).toBe(false)
    expect(
      isCompleteYearlyFinancial({ year: '2025', revenue: 500_000, free_cash_flow: 50_000 })
    ).toBe(false)
    expect(isCompleteYearlyFinancial({ year: '2025', free_cash_flow: 40_000 })).toBe(true)
    expect(isCompleteYearlyFinancial({ year: '2025', free_cash_flow: 0 })).toBe(false)
  })

  it('detects non-placeholder rows for integration entry and snapshots', () => {
    expect(yearlyFinancialRowHasNonPlaceholderData({ year: '2024', revenue: 0, ebitda: 0 })).toBe(
      false
    )
    expect(
      yearlyFinancialRowHasNonPlaceholderData({
        year: '2024',
        revenue: 0,
        ebitda: 0,
        free_cash_flow: 25_000,
      })
    ).toBe(true)
    expect(
      yearlyFinancialRowHasNonPlaceholderData({ year: '2024', revenue: 0, ebitda: -5000 })
    ).toBe(true)
    expect(
      yearlyFinancialRowHasNonPlaceholderData({
        year: '2025',
        revenue: 0,
        ebitda: 0,
        isForecast: true,
      })
    ).toBe(true)
    expect(
      yearlyFinancialsContainsNonPlaceholderData([{ year: '2024', revenue: 0, ebitda: 0 }])
    ).toBe(false)
    expect(
      yearlyFinancialsContainsNonPlaceholderData([
        { year: '2024', revenue: 0, ebitda: 0 },
        { year: '2023', revenue: 100, ebitda: 0 },
      ])
    ).toBe(true)
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
      expect(historicalYearRowNeedsRemovalWarning({ revenue: 0, ebitda: 0 }, 0)).toBe(false)
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

  it('builds yearlyFinancials rows from current + historical (dedupe by year, newest first)', () => {
    const rows = buildYearlyFinancialsFromCurrentAndHistorical(
      { year: 2024, revenue: 100, ebitda: 10 },
      [
        { year: 2023, revenue: 90, ebitda: 9 },
        { year: 2022, revenue: 80, ebitda: 8 },
      ]
    )
    expect(rows.map((r) => r.year)).toEqual(['2024', '2023', '2022'])
    expect(rows[0]).toMatchObject({ revenue: 100, ebitda: 10 })
  })
})
