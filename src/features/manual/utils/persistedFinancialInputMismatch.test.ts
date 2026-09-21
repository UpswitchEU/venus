import { describe, expect, it } from 'vitest'
import { persistedFinancialInputsDiffer } from './persistedFinancialInputMismatch'

const row = { year: 2023, revenue: 12000000, ebitda: 2100000 }
const form = { current_year_data: row }

describe('saved report versus current financial inputs', () => {
  it('detects the reopened Silverfin period mismatch even when amounts agree', () => {
    expect(
      persistedFinancialInputsDiffer(form, {
        details: { current_year_data: { ...row, year: 2025 } },
      })
    ).toBe(true)
  })
  it('detects edited amounts in a flat restored engine result', () => {
    expect(
      persistedFinancialInputsDiffer(form, {
        current_year_data: { ...row, ebitda: 2600000 },
      })
    ).toBe(true)
  })
  it('clears after a calculation using the current inputs', () => {
    expect(persistedFinancialInputsDiffer(form, { details: form })).toBe(false)
  })
  it('does not compare generated forecasts to adviser input forecasts', () => {
    expect(
      persistedFinancialInputsDiffer(form, {
        ...form,
        forecast_years_data: [{ ...row, year: 2026 }],
      })
    ).toBe(false)
  })
  it.each([
    null,
    {},
    { html_report: '<p>2025</p>' },
  ])('does not infer years from sparse results', (result) => {
    expect(persistedFinancialInputsDiffer(form, result)).toBe(false)
  })
})
