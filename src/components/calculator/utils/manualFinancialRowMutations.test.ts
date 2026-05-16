import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  applyManualFilingYearSelection,
  getManualPartialHistoricalYears,
  removeManualForecastYears,
  removeManualHistoricalYear,
  updateManualYearlyFinancialsRows,
} from './manualFinancialRowMutations'

function makeForm(yearlyFinancials: YearlyFinancials[]): ManualValuationFormData {
  return {
    companyName: 'Acme BV',
    businessType: 'software',
    industry: 'technology',
    country: 'BE',
    ownerManagers: 1,
    yearlyFinancials,
  } as ManualValuationFormData
}

describe('manual financial row mutations', () => {
  it('updates only the targeted historical or forecast row', () => {
    const rows = [
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
    ] as YearlyFinancials[]

    expect(
      updateManualYearlyFinancialsRows({
        yearlyFinancials: rows,
        year: '2025',
        isForecast: true,
        field: 'free_cash_flow',
        value: 42,
      })
    ).toEqual([
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true, free_cash_flow: 42 },
    ])
  })

  it('rebuilds historical rows and current-year data when a filing year is selected', () => {
    const result = applyManualFilingYearSelection(
      makeForm([{ year: '2024', revenue: 100, ebitda: 20 }]),
      2024
    )

    expect(result.filingYearConfirmed).toBe(true)
    expect(result.current_year_data?.year).toBe(2024)
    expect(result.yearlyFinancials.map((row) => row.year)).toContain('2024')
  })

  it('removes historical years only when more than one historical row remains', () => {
    const result = removeManualHistoricalYear(
      makeForm([
        { year: '2024', revenue: 100, ebitda: 20 },
        { year: '2023', revenue: 90, ebitda: 18 },
      ]),
      '2023'
    )

    expect(result.didRemove).toBe(true)
    expect(result.removedFiscalYear).toBe(2023)
    expect(result.next.yearlyFinancials).toEqual([{ year: '2024', revenue: 100, ebitda: 20 }])

    const refused = removeManualHistoricalYear(
      makeForm([{ year: '2024', revenue: 100, ebitda: 20 }]),
      '2024'
    )
    expect(refused.didRemove).toBe(false)
  })

  it('removes forecast rows without touching historical rows', () => {
    const result = removeManualForecastYears(
      makeForm([
        { year: '2024', revenue: 100, ebitda: 20 },
        { year: '2025', revenue: 120, ebitda: 24, isForecast: true },
      ])
    )

    expect(result.yearlyFinancials).toEqual([{ year: '2024', revenue: 100, ebitda: 20 }])
  })

  it('detects only partial historical rows', () => {
    expect(
      getManualPartialHistoricalYears([
        { year: '2024', revenue: 100, ebitda: undefined as unknown as number },
        { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
        { year: '2023', revenue: 100, ebitda: 20 },
      ])
    ).toEqual(['2024'])
  })
})
