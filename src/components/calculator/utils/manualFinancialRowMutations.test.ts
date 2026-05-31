import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  applyManualCurrentYearBalance,
  applyManualFilingYearSelection,
  applyManualFinancialYearSelection,
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

  it('applies assistant-selected historical years while preserving forecast rows', () => {
    const result = applyManualFinancialYearSelection(
      makeForm([
        { year: '2024', revenue: 100, ebitda: 20 },
        { year: '2023', revenue: 90, ebitda: 18 },
        { year: '2022', revenue: 80, ebitda: 16 },
        { year: '2025', revenue: 110, ebitda: 22, isForecast: true },
      ]),
      [2024, 2022]
    )

    expect(result.didApply).toBe(true)
    expect(result.next.yearlyFinancials).toEqual([
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2022', revenue: 80, ebitda: 16 },
      { year: '2025', revenue: 110, ebitda: 22, isForecast: true },
    ])
  })

  it('refuses assistant year selections that would leave no historical row', () => {
    const form = makeForm([
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2025', revenue: 110, ebitda: 22, isForecast: true },
    ])
    const result = applyManualFinancialYearSelection(form, [2025])

    expect(result.didApply).toBe(false)
    expect(result.next).toBe(form)
  })

  it('treats assistant selections matching the current historical set as a no-op', () => {
    const form = makeForm([
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2023', revenue: 90, ebitda: 18 },
    ])
    const result = applyManualFinancialYearSelection(form, [2024, 2023])

    expect(result.didApply).toBe(false)
    expect(result.next).toBe(form)
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

describe('applyManualCurrentYearBalance', () => {
  it('writes balance onto current_year_data and the latest actual yearly row', () => {
    const form = {
      ...makeForm([
        { year: '2024', revenue: 100, ebitda: 20 },
        { year: '2023', revenue: 90, ebitda: 18 },
        { year: '2025', revenue: 110, ebitda: 22, isForecast: true },
      ]),
      current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
    } as ManualValuationFormData

    const next = applyManualCurrentYearBalance(form, {
      cash: 5000,
      total_debt: 30000,
      current_liabilities: 12000,
    })

    expect(next.current_year_data).toMatchObject({
      year: 2024,
      cash: 5000,
      total_debt: 30000,
      current_liabilities: 12000,
    })
    // Only the latest non-forecast row (2024) carries the balance.
    expect(next.yearlyFinancials).toEqual([
      {
        year: '2024',
        revenue: 100,
        ebitda: 20,
        cash: 5000,
        total_debt: 30000,
        current_liabilities: 12000,
      },
      { year: '2023', revenue: 90, ebitda: 18 },
      { year: '2025', revenue: 110, ebitda: 22, isForecast: true },
    ])
  })

  it('keeps an explicit zero but skips blank (undefined) fields', () => {
    const form = {
      ...makeForm([{ year: '2024', revenue: 100, ebitda: 20 }]),
      current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
    } as ManualValuationFormData

    const next = applyManualCurrentYearBalance(form, { total_debt: 0 })
    expect(next.current_year_data).toMatchObject({ total_debt: 0 })
    expect(next.current_year_data).not.toHaveProperty('cash')
    expect(next.current_year_data).not.toHaveProperty('current_liabilities')
  })

  it('is a no-op when no finite values are provided', () => {
    const form = {
      ...makeForm([{ year: '2024', revenue: 100, ebitda: 20 }]),
      current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
    } as ManualValuationFormData
    expect(applyManualCurrentYearBalance(form, {})).toBe(form)
    expect(applyManualCurrentYearBalance(form, { cash: undefined })).toBe(form)
  })

  it('targets the max non-forecast year when current_year_data is absent', () => {
    const form = makeForm([
      { year: '2022', revenue: 80, ebitda: 16 },
      { year: '2024', revenue: 100, ebitda: 20 },
      { year: '2026', revenue: 120, ebitda: 24, isForecast: true },
    ])
    const next = applyManualCurrentYearBalance(form, { cash: 7000 })
    expect(next.yearlyFinancials).toEqual([
      { year: '2022', revenue: 80, ebitda: 16 },
      { year: '2024', revenue: 100, ebitda: 20, cash: 7000 },
      { year: '2026', revenue: 120, ebitda: 24, isForecast: true },
    ])
    // We never fabricate a current_year_data when none exists.
    expect(next.current_year_data).toBeUndefined()
  })
})
