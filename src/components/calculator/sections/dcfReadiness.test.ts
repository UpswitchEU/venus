import { describe, expect, it } from 'vitest'
import { deriveDcfReadinessInsight } from './dcfReadiness'

describe('deriveDcfReadinessInsight', () => {
  it('marks imported histories as ready when capex, tax, and working-capital signals are available', () => {
    const result = deriveDcfReadinessInsight({
      historicalYearsData: [
        {
          year: 2023,
          revenue: 900_000,
          ebitda: 90_000,
          capex: 30_000,
          tax_expense: 20_000,
          accounts_receivable: 100_000,
          inventory: 50_000,
          accounts_payable: 40_000,
        },
      ],
      currentYearData: {
        year: 2024,
        revenue: 1_000_000,
        ebitda: 100_000,
        capex: 35_000,
        tax_expense: 22_000,
        accounts_receivable: 120_000,
        inventory: 60_000,
        accounts_payable: 55_000,
      },
    })

    expect(result.status).toBe('imported_ready')
    expect(result.missingSignals).toEqual([])
  })

  it('marks partial histories when some actual cash-flow components are still missing', () => {
    const result = deriveDcfReadinessInsight({
      historicalYearsData: [
        {
          year: 2023,
          revenue: 900_000,
          ebitda: 90_000,
          capex: 30_000,
        },
      ],
      currentYearData: {
        year: 2024,
        revenue: 1_000_000,
        ebitda: 100_000,
        current_assets: 300_000,
        current_liabilities: 180_000,
        cash: 40_000,
      },
    })

    expect(result.status).toBe('partial')
    expect(result.missingSignals).toContain('taxes')
  })

  it('marks manual fallback when only revenue and ebitda are present', () => {
    const result = deriveDcfReadinessInsight({
      historicalYearsData: [{ year: 2023, revenue: 900_000, ebitda: 90_000 }],
      currentYearData: {
        year: 2024,
        revenue: 1_000_000,
        ebitda: 100_000,
      },
    })

    expect(result.status).toBe('manual_fallback')
    expect(result.missingSignals).toEqual(['capex', 'taxes', 'working_capital'])
  })
})
