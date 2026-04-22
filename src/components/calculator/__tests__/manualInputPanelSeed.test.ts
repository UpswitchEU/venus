import { describe, expect, it, afterEach, vi } from 'vitest'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { getSeedBaseFilingYear, getSeedYearlyFinancials } from '../ManualInputPanel'

describe('getSeedBaseFilingYear / getSeedYearlyFinancials (filing year rollover)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('empty draft: basis follows current filing year on 2026-04-22 (not stale 2024)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        filingYearConfirmed: false,
      },
      new Date()
    )
    expect(base).toBe(2025)
  })

  it('does not move basis when a year row has real revenue (2024 stay)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 100_000, ebitda: 0 },
        filingYearConfirmed: false,
      },
      new Date()
    )
    expect(base).toBe(2024)
  })

  it('keeps an explicit year when filing year is confirmed (even if all-zero)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        filingYearConfirmed: true,
      },
      new Date()
    )
    expect(base).toBe(2024)
  })

  it('re-seeds default yearly columns from live filing year when only placeholders', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const yf = getSeedYearlyFinancials({
      current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
      yearlyFinancials: [
        { year: '2024', revenue: 0, ebitda: 0 },
        { year: '2023', revenue: 0, ebitda: 0 },
        { year: '2022', revenue: 0, ebitda: 0 },
      ],
      filingYearConfirmed: false,
    })
    const fy = getCurrentFilingYear()
    expect(yf.map((r) => r.year)).toEqual([String(fy), String(fy - 1), String(fy - 2)])
  })
})
