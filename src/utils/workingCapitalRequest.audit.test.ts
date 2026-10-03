import { describe, expect, it } from 'vitest'
import type { YearDataInput } from '@/types/valuation'
import { buildValuationRequestYearData } from './valuationRequestYearData'

function request(current: Partial<YearDataInput>, previous: Partial<YearDataInput>) {
  return buildValuationRequestYearData({
    currentFiscalYear: 2024,
    revenue: 1000,
    ebitda: 100,
    effectiveCurrentYearData: { year: 2024, revenue: 1000, ebitda: 100, ...current },
    actualHistoricalData: [{ year: 2023, revenue: 900, ebitda: 90, ...previous }],
    rawForecastData: [],
    normByYear: {},
  })
}

describe('working capital in submitted valuation inputs', () => {
  it('leaves unavailable annual reinvestment absent instead of manufacturing a cash flow', () => {
    expect(
      request({ accounts_receivable: 200 }, { accounts_receivable: 100 }).currentYearData.nwc_change
    ).toBeUndefined()
    const trade = { accounts_receivable: 100, inventory: 0, accounts_payable: 50 }
    expect(request(trade, { ...trade, year: 2022 }).currentYearData.nwc_change).toBeUndefined()
  })
  it('carries a signed annual change while leaving the source statements intact', () => {
    const current = { accounts_receivable: 80.1, inventory: 0, accounts_payable: 50.2 }
    const prior = { accounts_receivable: 100.1, inventory: 0, accounts_payable: 40.2 }
    const result = request(current, prior)
    expect(result.currentYearData.nwc_change).toBe(-30)
    expect(result.currentYearData).toMatchObject(current)
    expect(result.historicalYearsData[0]).toMatchObject(prior)
    expect(current).not.toHaveProperty('nwc_change')
  })
  it('preserves an explicit zero even where a balance-sheet change could be computed', () => {
    const trade = { accounts_receivable: 100, inventory: 0, accounts_payable: 50 }
    expect(
      request({ ...trade, nwc_change: 0 }, { ...trade, accounts_receivable: 50 }).currentYearData
        .nwc_change
    ).toBe(0)
  })
})
