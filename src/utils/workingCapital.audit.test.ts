import { describe, expect, it } from 'vitest'
import { deriveDcfReadinessInsight } from '@/components/calculator/sections/dcfReadiness'
import type { YearDataInput } from '@/types/valuation'
import { calculateWorkingCapitalBase, deriveNwcChangesForActualYears } from './yearData'

const row = (year: number, extra: Partial<YearDataInput> = {}): YearDataInput => ({
  year,
  revenue: 1000,
  ebitda: 100,
  capex: 0,
  tax_expense: 0,
  ...extra,
})
const trade = { accounts_receivable: 100, inventory: 20, accounts_payable: 40 }
const aggregate = { current_assets: 300, cash: 50, current_liabilities: 180, short_term_debt: 30 }

describe('working capital evidence integrity', () => {
  it('does not turn missing trade components into zero observations', () => {
    expect(calculateWorkingCapitalBase({ accounts_receivable: 100 })).toBeNull()
    expect(
      calculateWorkingCapitalBase({ current_assets: 300, current_liabilities: 180 })
    ).toBeNull()
  })
  it('uses a complete aggregate bridge when trade detail is partial', () => {
    expect(calculateWorkingCapitalBase({ ...aggregate, accounts_receivable: 100 })).toBe(100)
  })
  it('preserves explicit zero balances and signed working capital', () => {
    expect(
      calculateWorkingCapitalBase({ accounts_receivable: 0, inventory: 0, accounts_payable: 30 })
    ).toBe(-30)
  })
  it('does not present a multi-year change as one year of reinvestment', () => {
    const years = [row(2022, trade), row(2024, { ...trade, accounts_receivable: 150 })]
    expect(deriveNwcChangesForActualYears(years)[1].nwc_change).toBeUndefined()
    expect(
      deriveDcfReadinessInsight({ historicalYearsData: [years[0]], currentYearData: years[1] })
        .missingSignals
    ).toContain('working_capital')
  })
  it('does not subtract incompatible trade and aggregate bases', () => {
    expect(
      deriveNwcChangesForActualYears([row(2023, trade), row(2024, aggregate)])[1].nwc_change
    ).toBeUndefined()
  })
  it('uses the same complete basis in both years when evidence coverage changes', () => {
    const years = [row(2023, aggregate), row(2024, { ...aggregate, ...trade, current_assets: 320 })]
    expect(deriveNwcChangesForActualYears(years)[1].nwc_change).toBe(20)
  })
  it('uses decimal subtraction for changes and retains explicit advisor zero', () => {
    const years = [
      row(2023, { accounts_receivable: 0.1, inventory: 0.2, accounts_payable: 0 }),
      row(2024, { accounts_receivable: 0.2, inventory: 0.2, accounts_payable: 0 }),
    ]
    expect(deriveNwcChangesForActualYears(years)[1].nwc_change).toBe(0.1)
    expect(
      deriveNwcChangesForActualYears([years[0], { ...years[1], nwc_change: 0 }])[1].nwc_change
    ).toBe(0)
  })
  it('never derives infinite cash flows from finite balances', () => {
    const years = [
      row(2023, { accounts_receivable: 0, inventory: 0, accounts_payable: 1e308 }),
      row(2024, { accounts_receivable: 1e308, inventory: 0, accounts_payable: 0 }),
    ]
    expect(deriveNwcChangesForActualYears(years)[1].nwc_change).toBeUndefined()
  })
  it('does not count an earliest-year change as evidence for a missing later year', () => {
    const insight = deriveDcfReadinessInsight({
      historicalYearsData: [row(2023, { nwc_change: 10 })],
      currentYearData: row(2024),
    })
    expect(insight.status).toBe('partial')
    expect(insight.missingSignals).toContain('working_capital')
  })
  it('does not derive from duplicate fiscal periods', () => {
    const years = [
      row(2023, trade),
      row(2023, { ...trade, accounts_receivable: 200 }),
      row(2024, trade),
    ]
    expect(deriveNwcChangesForActualYears(years).every((y) => y.nwc_change === undefined)).toBe(
      true
    )
  })
})
