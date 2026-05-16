import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  applyManualInitialPrefill,
  buildManualInitialPrefillData,
  buildManualPrefillCompany,
} from './manualInputPrefill'

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: '',
    businessType: '',
    industry: '',
    country: 'BE',
    businessStructure: '',
    ownerManagers: 1,
    fteEmployees: 5,
    yearlyFinancials: [
      { year: '2024', revenue: 0, ebitda: 0 },
      { year: '2023', revenue: 0, ebitda: 0 },
    ] as YearlyFinancials[],
    ...overrides,
  } as ManualValuationFormData
}

describe('manual input prefill utilities', () => {
  it('builds a narrow initial prefill payload from manual form data', () => {
    expect(
      buildManualInitialPrefillData({
        companyName: 'Acme BV',
        current_year_data: { year: 2024, revenue: 100, ebitda: 20 },
        kboNumber: 'BE0123456789',
        yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 20 }],
      })
    ).toEqual({
      address: undefined,
      businessStructure: undefined,
      businessType: undefined,
      businessTypeCode: undefined,
      canonicalNaceCode: undefined,
      companyName: 'Acme BV',
      country: undefined,
      fteEmployees: undefined,
      industry: undefined,
      kboNumber: 'BE0123456789',
      legalForm: undefined,
      naceCode: undefined,
      naceDescription: undefined,
      ownerManagers: undefined,
      yearFounded: undefined,
      yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 20 }],
    })
  })

  it('fills blank/default fields and maps legal form to business structure', () => {
    const result = applyManualInitialPrefill({
      previous: makeForm(),
      countryUserOverridden: false,
      businessTypeToApply: 'software',
      industryToApply: 'technology',
      prefill: {
        companyName: 'Acme BV',
        country: 'nl',
        legalForm: 'BV',
        ownerManagers: 2,
        fteEmployees: 12,
        yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 20 }],
      },
    })

    expect(result.next).toMatchObject({
      companyName: 'Acme BV',
      country: 'NL',
      legalForm: 'BV',
      businessStructure: 'bv',
      businessType: 'software',
      industry: 'technology',
      ownerManagers: 2,
      fteEmployees: 12,
    })
    expect(result.next.yearlyFinancials).toEqual([{ year: '2024', revenue: 100, ebitda: 20 }])
    expect(result.companyNameUpdate).toBe('Acme BV')
  })

  it('does not overwrite explicit advisor input or country overrides', () => {
    const previous = makeForm({
      companyName: 'Advisor Choice',
      country: 'DE',
      businessType: 'services',
      ownerManagers: 3,
      fteEmployees: 9,
      yearlyFinancials: [{ year: '2024', revenue: 1000, ebitda: 100 }],
    })

    const result = applyManualInitialPrefill({
      previous,
      countryUserOverridden: true,
      businessTypeToApply: 'software',
      industryToApply: 'technology',
      prefill: {
        companyName: 'Session Company',
        country: 'NL',
        ownerManagers: 1,
        fteEmployees: 5,
        yearlyFinancials: [{ year: '2024', revenue: 1, ebitda: 1 }],
      },
    })

    expect(result.next).toMatchObject({
      companyName: 'Advisor Choice',
      country: 'DE',
      businessType: 'services',
      industry: 'technology',
      ownerManagers: 3,
      fteEmployees: 9,
    })
    expect(result.next.yearlyFinancials).toEqual(previous.yearlyFinancials)
  })

  it('builds the selected company shell with canonical NACE metadata', () => {
    expect(
      buildManualPrefillCompany({
        businessTypeToApply: 'software',
        companyName: 'Acme BV',
        prefill: {
          address: 'Main Street 1',
          canonicalNaceCode: '62010',
          kboNumber: 'BE0123456789',
          legalForm: 'BV',
          naceCode: 'SBI-6201',
          naceDescription: 'Software',
        },
      })
    ).toMatchObject({
      id: 'BE0123456789',
      name: 'Acme BV',
      kboNumber: 'BE0123456789',
      canonicalNaceCode: '62010',
      activityCode: 'SBI-6201',
    })
  })

  it('does not build a selected company without a name or expand data', () => {
    expect(
      buildManualPrefillCompany({
        businessTypeToApply: undefined,
        companyName: 'Acme BV',
        prefill: {},
      })
    ).toBeNull()
    expect(
      buildManualPrefillCompany({
        businessTypeToApply: 'software',
        companyName: '',
        prefill: {},
      })
    ).toBeNull()
  })
})
