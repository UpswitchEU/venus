import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '../../../types/valuation'
import { deriveManualInputReadiness } from './manualInputReadiness'

function makeFormData(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: '',
    businessType: '',
    yearlyFinancials: [],
    ...overrides,
  } as ManualValuationFormData
}

describe('deriveManualInputReadiness', () => {
  it('requires company, business type, financials, and save permission before submit', () => {
    expect(
      deriveManualInputReadiness({
        canSave: false,
        formData: makeFormData({
          companyName: 'Acme BV',
          businessType: 'software_products',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 20 }],
        }),
        hasSelectedBusinessType: false,
        hasSelectedCompany: false,
        latestCompleteYearlyFinancial: { year: '2025', revenue: 100, ebitda: 20 },
      }).canSubmit
    ).toBe(false)

    expect(
      deriveManualInputReadiness({
        canSave: true,
        formData: makeFormData({
          companyName: 'Acme BV',
          businessType: 'software_products',
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 20 }],
        }),
        hasSelectedBusinessType: false,
        hasSelectedCompany: false,
        latestCompleteYearlyFinancial: { year: '2025', revenue: 100, ebitda: 20 },
      }).canSubmit
    ).toBe(true)
  })

  it('accepts multi-segment business type selection as a business type signal', () => {
    const readiness = deriveManualInputReadiness({
      canSave: true,
      formData: makeFormData({
        companyName: 'Acme BV',
        business_type_segments: [{ business_type_id: 'industrial_services', weight: 100 }],
        yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 0 }],
      }),
      hasSelectedBusinessType: false,
      hasSelectedCompany: false,
      latestCompleteYearlyFinancial: { year: '2025', revenue: 100, ebitda: 0 },
    })

    expect(readiness.hasBusinessTypeSegment).toBe(true)
    expect(readiness.hasBusinessType).toBe(true)
    expect(readiness.canSubmit).toBe(true)
  })

  it('counts explicit zero EBITDA as present', () => {
    const readiness = deriveManualInputReadiness({
      canSave: true,
      formData: makeFormData({
        companyName: 'Acme BV',
        businessType: 'software_products',
        yearlyFinancials: [
          { year: '2025', revenue: 100, ebitda: 0 },
          { year: '2024', revenue: 80, ebitda: undefined },
        ],
      }),
      hasSelectedBusinessType: false,
      hasSelectedCompany: false,
      latestCompleteYearlyFinancial: { year: '2025', revenue: 100, ebitda: 0 },
    })

    expect(readiness.hasEbitdaValue).toBe(true)
    expect(readiness.totalYearsWithEbitda).toBe(1)
  })
})
