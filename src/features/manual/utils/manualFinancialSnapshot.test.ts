// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { YearDataInput } from '@/types/valuation'
import { buildSubmittedFinancialSnapshot } from './manualFinancialSnapshot'

function year(row: Partial<YearDataInput> & { year: number }): YearDataInput {
  return {
    revenue: 0,
    ebitda: 0,
    ...row,
  }
}

describe('buildSubmittedFinancialSnapshot', () => {
  it('combines current, historical, and forecast rows in descending year order', () => {
    const snapshot = buildSubmittedFinancialSnapshot({
      revenue: 1,
      ebitda: 2,
      current_year_data: year({ year: 2025, revenue: 100, ebitda: 10 }),
      historical_years_data: [
        year({ year: 2023, revenue: 80, ebitda: 8 }),
        year({ year: 2024, revenue: 90, ebitda: 9, capex: 3, nwc_change: 1 }),
      ],
      forecast_years_data: [year({ year: 2026, revenue: 110, ebitda: 11 })],
    })

    expect(snapshot.revenue).toBe(100)
    expect(snapshot.ebitda).toBe(10)
    expect(snapshot.yearlyFinancials.map((row) => row.year)).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
    ])
    expect(snapshot.yearlyFinancials[0]).toMatchObject({ isForecast: true })
    expect(snapshot.yearlyFinancials[2]).toMatchObject({ capex: 3, nwc_change: 1 })
  })

  it('filters zero historical placeholders while keeping explicit forecast structure', () => {
    const snapshot = buildSubmittedFinancialSnapshot({
      revenue: 500,
      ebitda: 50,
      current_year_data: year({ year: 2025 }),
      historical_years_data: [year({ year: 2024 })],
      forecast_years_data: [year({ year: 2026 })],
    })

    expect(snapshot.revenue).toBe(0)
    expect(snapshot.ebitda).toBe(0)
    expect(snapshot.yearlyFinancials).toEqual([
      {
        year: '2026',
        revenue: 0,
        ebitda: 0,
        capex: undefined,
        nwc_change: undefined,
        isForecast: true,
      },
    ])
  })

  it('falls back to top-level revenue and EBITDA when current year data is absent', () => {
    const snapshot = buildSubmittedFinancialSnapshot({
      revenue: 500,
      ebitda: 50,
      current_year_data: null,
      historical_years_data: [],
      forecast_years_data: [],
    })

    expect(snapshot).toEqual({
      revenue: 500,
      ebitda: 50,
      yearlyFinancials: [],
    })
  })
})
