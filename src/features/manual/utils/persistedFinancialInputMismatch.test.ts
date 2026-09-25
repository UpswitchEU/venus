import { describe, expect, it } from 'vitest'
import { persistedFinancialInputsDiffer } from './persistedFinancialInputMismatch'

const row = { year: 2023, revenue: 12000000, ebitda: 2100000 }
const form = { current_year_data: row }

// The shape Titan stores for a fresh advisor valuation (report 9a9728f9, 25 Sep 2026):
// the engine echoes the current year only, with the accepted add-back folded into
// `ebitda` and the advisor's figure kept as `reported_ebitda`.
const engineEcho2024 = {
  year: 2024,
  revenue: '4800000',
  ebitda: '436000',
  reported_ebitda: '340000',
  normalized_ebitda: '436000',
  ebitda_normalized: true,
  capex: null,
  nwc_change: null,
}
const multiYearForm = {
  current_year_data: { year: 2024, revenue: 4800000, ebitda: 340000 },
  historical_years_data: [
    { year: 2023, revenue: 4400000, ebitda: 300000 },
    { year: 2022, revenue: 4100000, ebitda: 280000 },
    { year: 2021, revenue: 3900000, ebitda: 250000 },
  ],
}

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
  it('stays clear right after a multi-year valuation whose result echoes only the current year', () => {
    expect(
      persistedFinancialInputsDiffer(multiYearForm, {
        details: { current_year_data: engineEcho2024 },
      })
    ).toBe(false)
  })
  it('still flags a changed current year when the result carries no history', () => {
    expect(
      persistedFinancialInputsDiffer(
        {
          ...multiYearForm,
          current_year_data: { year: 2024, revenue: 5000000, ebitda: 340000 },
        },
        { details: { current_year_data: engineEcho2024 } }
      )
    ).toBe(true)
  })
  it('compares history when the saved result recorded it', () => {
    const savedHistory = multiYearForm.historical_years_data
    const result = {
      current_year_data: multiYearForm.current_year_data,
      historical_years_data: savedHistory,
    }
    expect(persistedFinancialInputsDiffer(multiYearForm, result)).toBe(false)
    expect(
      persistedFinancialInputsDiffer(
        {
          ...multiYearForm,
          historical_years_data: [
            { year: 2023, revenue: 4400000, ebitda: 310000 },
            ...savedHistory.slice(1),
          ],
        },
        result
      )
    ).toBe(true)
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
