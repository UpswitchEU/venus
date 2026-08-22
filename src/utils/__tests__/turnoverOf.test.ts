import { describe, expect, it } from 'vitest'

import type { YearDataInput } from '@/types/valuation'
import { buildYearlyFinancialsFromCurrentAndHistorical, turnoverOf } from '@/utils/yearlyFinancials'

/**
 * The manual panel must show the figure the engine values on — turnover — and
 * must not overwrite a figure the advisor has edited.
 *
 * Real rows from the advisor's property-holding client: FY2022 booked an
 * EUR 18.3M extraordinary gain, so Hermes's gross `revenue` read EUR 19.8M
 * against EUR 1.3M of turnover. Hermes's identity
 * (revenue − financial_income − extraordinary_income = operating_revenue)
 * holds to the cent on an untouched import and breaks on an edit.
 */

const FY2022 = {
  year: 2022,
  revenue: 19_819_785.21,
  operating_revenue: 1_312_740.76,
  financial_income: 225_044.45,
  extraordinary_income: 18_282_000,
  ebitda: 997_939.4,
}

describe('turnoverOf', () => {
  it('returns turnover for an untouched import', () => {
    expect(turnoverOf(FY2022)).toBe(1_312_740.76)
  })

  it('keeps a hand-edited revenue when the identity no longer holds', () => {
    expect(turnoverOf({ ...FY2022, revenue: 1_500_000 })).toBe(1_500_000)
  })

  it('keeps the gross figure when there is no operating revenue', () => {
    expect(turnoverOf({ year: 2024, revenue: 100_000, ebitda: 20_000 })).toBe(100_000)
  })

  it('falls back to gross on a negative operating revenue', () => {
    expect(turnoverOf({ year: 2024, revenue: 5_000, operating_revenue: -120_000 })).toBe(5_000)
  })

  it('is undefined for a non-row', () => {
    expect(turnoverOf(null)).toBeUndefined()
  })
})

describe('buildYearlyFinancialsFromCurrentAndHistorical — panel shows turnover', () => {
  it('puts turnover in the revenue column for imported rows', () => {
    const rows = buildYearlyFinancialsFromCurrentAndHistorical(
      {
        year: 2025,
        revenue: 2_119_923.44,
        operating_revenue: 1_764_574.97,
        financial_income: 355_348.47,
        ebitda: 1_484_025.26,
      } as unknown as YearDataInput,
      [FY2022 as unknown as YearDataInput]
    )
    expect(rows.map((r) => [r.year, r.revenue])).toEqual([
      ['2025', 1_764_574.97],
      ['2022', 1_312_740.76],
    ])
  })
})
