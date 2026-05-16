import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { deriveManualDcfProjectionAutofillState } from './manualDcfProjectionPreview'

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  const yearlyFinancials = [
    { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
    { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
    { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
  ] as YearlyFinancials[]

  return {
    businessType: 'software',
    industry: 'technology',
    dcf_revenue_growth_pct: 8,
    dcf_ebitda_margin_pct: 20,
    dcf_capex_pct: 4,
    dcf_da_pct: 3,
    dcf_nwc_pct: 1,
    dcf_tax_rate_pct: 25,
    yearlyFinancials,
    ...overrides,
  } as ManualValuationFormData
}

describe('manual DCF projection preview state', () => {
  it('derives projection rows and enables autofill when assumptions cover all forecast rows', () => {
    const formData = makeForm()
    const dcfForecastRows = formData.yearlyFinancials.filter((row) => row.isForecast)

    const result = deriveManualDcfProjectionAutofillState({
      formData,
      hasDcfSelected: true,
      dcfForecastRows,
      dcfSmartDefaultsFromHistory: null,
    })

    expect(result.canApplyDcfProjectionAutofill).toBe(true)
    expect(result.dcfProjectionAutofillRows).toHaveLength(2)
  })

  it('disables autofill in FCFF-only mode while still deriving preview rows for display', () => {
    const formData = makeForm({ dcf_input_mode: 'fcff_only' })
    const dcfForecastRows = formData.yearlyFinancials.filter((row) => row.isForecast)

    const result = deriveManualDcfProjectionAutofillState({
      formData,
      hasDcfSelected: true,
      dcfForecastRows,
      dcfSmartDefaultsFromHistory: null,
    })

    expect(result.canApplyDcfProjectionAutofill).toBe(false)
    expect(result.dcfProjectionAutofillRows).toHaveLength(2)
  })

  it('disables autofill when required projection assumptions are missing', () => {
    const formData = makeForm({ dcf_revenue_growth_pct: undefined })
    const dcfForecastRows = formData.yearlyFinancials.filter((row) => row.isForecast)

    const result = deriveManualDcfProjectionAutofillState({
      formData,
      hasDcfSelected: true,
      dcfForecastRows,
      dcfSmartDefaultsFromHistory: null,
    })

    expect(result.canApplyDcfProjectionAutofill).toBe(false)
    expect(result.dcfProjectionAutofillRows).toHaveLength(0)
  })

  it('returns an empty disabled state when DCF is not selected', () => {
    const formData = makeForm()

    const result = deriveManualDcfProjectionAutofillState({
      formData,
      hasDcfSelected: false,
      dcfForecastRows: formData.yearlyFinancials.filter((row) => row.isForecast),
      dcfSmartDefaultsFromHistory: null,
    })

    expect(result.canApplyDcfProjectionAutofill).toBe(false)
    expect(result.dcfProjectionAutofillRows).toEqual([])
  })
})
