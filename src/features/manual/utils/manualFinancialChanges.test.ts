// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hasFinancialInputsChangedSinceSubmit } from './manualFinancialChanges'
import { buildSubmittedFinancialSnapshot } from './manualFinancialSnapshot'
import { buildManualLiveYearlyFinancials } from './manualLiveYearlyFinancials'
import { buildManualRestoredFinancialSnapshot } from './manualRestoredFinancialSnapshot'

const base = { year: 2025, revenue: 1_000_000, ebitda: 100_000 }

describe('financial changes that require a new valuation', () => {
  it.each([
    'free_cash_flow',
    'depreciation',
    'tax_expense',
    'cash',
    'total_debt',
    'lease_liabilities',
    'total_equity',
    'total_assets',
    'total_liabilities',
    'accounts_receivable',
    'accounts_payable',
    'inventory',
    'short_term_debt',
    'current_assets',
    'current_liabilities',
    'capex',
    'nwc_change',
  ] as const)('retains and detects a change to %s after submission and reopening', (key) => {
    const form = { current_year_data: { ...base, [key]: 10 } }
    for (const snapshot of [
      buildSubmittedFinancialSnapshot(form),
      buildManualRestoredFinancialSnapshot(form),
    ]) {
      expect(snapshot?.yearlyFinancials[0][key]).toBe(10)
      if (!snapshot) throw new Error('Missing snapshot')
      const rows = buildManualLiveYearlyFinancials({ formData: form })
      expect(hasFinancialInputsChangedSinceSubmit({ yearlyFinancials: rows }, snapshot)).toBe(false)
      expect(
        hasFinancialInputsChangedSinceSubmit(
          { yearlyFinancials: [{ ...rows[0], [key]: 0 }] },
          snapshot
        )
      ).toBe(true)
      expect(
        hasFinancialInputsChangedSinceSubmit(
          { yearlyFinancials: [{ ...rows[0], [key]: undefined }] },
          snapshot
        )
      ).toBe(true)
    }
  })

  it('requires recalculation after deleting all rows or clearing a scalar', () => {
    const snapshot = buildSubmittedFinancialSnapshot({ current_year_data: base })
    expect(hasFinancialInputsChangedSinceSubmit({ yearlyFinancials: [] }, snapshot)).toBe(true)
    expect(hasFinancialInputsChangedSinceSubmit({ ebitda: undefined }, snapshot)).toBe(true)
    expect(hasFinancialInputsChangedSinceSubmit({ companyName: 'Updated name' }, snapshot)).toBe(
      false
    )
  })

  it('compares forecasts separately without mistaking their earnings for the current year', () => {
    const form = {
      current_year_data: base,
      forecast_years_data: [{ year: 2026, revenue: 2_000_000, ebitda: 250_000 }],
    }
    const snapshot = buildSubmittedFinancialSnapshot(form)
    const yearlyFinancials = buildManualLiveYearlyFinancials({ formData: form })
    expect(
      hasFinancialInputsChangedSinceSubmit(
        { yearlyFinancials, revenue: 2_000_000, ebitda: 250_000 },
        snapshot
      )
    ).toBe(false)
  })

  it('restores a single consistent baseline for turnover and reported EBITDA', () => {
    const row = {
      ...base,
      revenue: 1_050_000,
      operating_revenue: 1_000_000,
      financial_income: 50_000,
      ebitda: 125_000,
      reported_ebitda: 100_000,
      ebitda_normalized: true,
    }
    const form = { current_year_data: row, historical_years_data: [{ ...base, revenue: 700_000 }] }
    const snapshot = buildManualRestoredFinancialSnapshot(form)
    expect(snapshot?.yearlyFinancials).toHaveLength(1)
    expect(snapshot).toMatchObject({ revenue: 1_000_000, ebitda: 100_000 })
    if (!snapshot) throw new Error('Missing snapshot')
    expect(
      hasFinancialInputsChangedSinceSubmit(
        { yearlyFinancials: buildManualLiveYearlyFinancials({ formData: form }) },
        snapshot
      )
    ).toBe(false)
  })
})
