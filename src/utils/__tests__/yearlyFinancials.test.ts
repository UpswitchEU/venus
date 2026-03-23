import { describe, expect, it } from 'vitest'
import {
  getCompleteYearlyFinancialsDesc,
  getLatestCompleteYearlyFinancial,
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
})
