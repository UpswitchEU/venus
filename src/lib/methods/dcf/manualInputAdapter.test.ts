import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { dcfManualInputAdapter } from './manualInputAdapter'

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    businessType: 'software',
    industry: 'technology',
    dcf_revenue_growth_pct: 8,
    dcf_ebitda_margin_pct: 20,
    dcf_capex_pct: 4,
    dcf_da_pct: 3,
    dcf_nwc_pct: 1,
    dcf_tax_rate_pct: 25,
    yearlyFinancials: [
      { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
    ] as YearlyFinancials[],
    ...overrides,
  } as ManualValuationFormData
}

describe('dcfManualInputAdapter', () => {
  it('is bound to the canonical DCF method key', () => {
    expect(dcfManualInputAdapter.key).toBe('dcf')
  })

  it('derives DCF forecast rows through the method adapter', () => {
    const formData = makeForm()
    const rows = dcfManualInputAdapter.deriveForecastRows(true, formData.yearlyFinancials)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ year: '2025', isForecast: true })
  })

  it('derives projection autofill state through the method adapter', () => {
    const formData = makeForm()
    const dcfForecastRows = dcfManualInputAdapter.deriveForecastRows(
      true,
      formData.yearlyFinancials
    )

    const state = dcfManualInputAdapter.deriveProjectionAutofillState({
      formData,
      hasMethodSelected: true,
      forecastRows: dcfForecastRows,
      smartDefaults: null,
    })

    expect(state.canApply).toBe(true)
    expect(state.rows).toHaveLength(1)
  })

  it('switches input mode through the method adapter', () => {
    const result = dcfManualInputAdapter.switchInputMode(makeForm(), 'fcff_only')

    expect(result.dcf_input_mode).toBe('fcff_only')
    expect(result.dcf_terminal_value_method).toBe('perpetual_growth')
    expect(result.yearlyFinancials.find((row) => row.isForecast)?.free_cash_flow).toEqual(
      expect.any(Number)
    )
  })
})
