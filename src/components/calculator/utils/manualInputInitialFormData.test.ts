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
})
