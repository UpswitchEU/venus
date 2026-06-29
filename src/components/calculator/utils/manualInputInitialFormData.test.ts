import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { buildManualInputInitialFormData } from './manualInputInitialFormData'

describe('buildManualInputInitialFormData', () => {
  it('normalizes blank manual form defaults and canonical NACE fallback', () => {
    const result = buildManualInputInitialFormData({
      companyName: 'Acme BV',
      naceCode: '62010',
      yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 20 }] as YearlyFinancials[],
    })

    expect(result).toMatchObject({
      companyName: 'Acme BV',
      naceCode: '62010',
      canonicalNaceCode: '62010',
      ownerManagers: 1,
      fteEmployees: 5,
      dcf_input_mode: 'ebitda',
    })
    expect(result.yearlyFinancials).toEqual([{ year: '2024', revenue: 100, ebitda: 20 }])
  })

  it('preserves explicit DCF input mode and filing-year confirmation', () => {
    const result = buildManualInputInitialFormData({
      dcf_input_mode: 'fcff_only',
      filingYearConfirmed: true,
      yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 20 }] as YearlyFinancials[],
    } as Partial<ManualValuationFormData>)

    expect(result.dcf_input_mode).toBe('fcff_only')
    expect(result.filingYearConfirmed).toBe(true)
  })

  it('strips stale FCFF from initial forecast rows in default EBITDA mode', () => {
    const result = buildManualInputInitialFormData({
      forecast_years_data: [{ year: 2026, revenue: 1_050_000, ebitda: 105_000, free_cash_flow: 1 }],
    } as Partial<ManualValuationFormData>)

    expect(result.forecast_years_data).toEqual([
      { year: 2026, revenue: 1_050_000, ebitda: 105_000 },
    ])
  })

  it('preserves initial forecast FCFF in explicit FCFF-only mode', () => {
    const result = buildManualInputInitialFormData({
      dcf_input_mode: 'fcff_only',
      forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
    } as Partial<ManualValuationFormData>)

    expect(result.forecast_years_data).toEqual([
      { year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 },
    ])
  })

  it('keeps restored advisor controls when normalizing manual defaults', () => {
    const result = buildManualInputInitialFormData({
      real_estate_treatment: 'included',
      exclude_real_estate: false,
      real_estate_market_value: 900_000,
      real_estate_book_value: 650_000,
      estimated_market_rent: 42_000,
      multiple_calibration_adjustment: -0.75,
      multiple_calibration_note: 'Supplier concentration',
      effective_multiple_override: 6,
      effective_multiple_override_note: 'Strategic buyer premium',
      historical_ebitda_weighting_mode: 'weighted',
      historical_ebitda_weights: { 2023: 10, 2024: 30, 2025: 60 },
      show_enterprise_to_equity_bridge: false,
      owner_salary_addback: 80_000,
      owner_role: 'working',
      yearlyFinancials: [
        { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
      ] as YearlyFinancials[],
    } as Partial<ManualValuationFormData>)

    expect(result).toMatchObject({
      real_estate_treatment: 'included',
      exclude_real_estate: false,
      real_estate_market_value: 900_000,
      real_estate_book_value: 650_000,
      estimated_market_rent: 42_000,
      multiple_calibration_adjustment: -0.75,
      multiple_calibration_note: 'Supplier concentration',
      effective_multiple_override: 6,
      effective_multiple_override_note: 'Strategic buyer premium',
      historical_ebitda_weighting_mode: 'weighted',
      historical_ebitda_weights: { 2023: 10, 2024: 30, 2025: 60 },
      show_enterprise_to_equity_bridge: false,
      owner_salary_addback: 80_000,
      owner_role: 'working',
    })
  })
})
