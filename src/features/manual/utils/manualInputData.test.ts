// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualInputInitialData, buildManualLiveValuationSubmitData } from './manualInputData'

describe('manualInputData', () => {
  it('builds initial data with store-first owner and employee fields', () => {
    expect(
      buildManualInputInitialData({
        collectedData: {
          companyName: 'Acme',
          legalForm: 'BV',
          ownerManagers: 1,
          fteEmployees: 3,
          current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
        },
        formStoreData: {
          number_of_owners: 2,
          number_of_employees: 7,
          current_year_data: { year: 2026, revenue: 120, ebitda: 12 },
          filing_year_confirmed: true,
        },
        formActivityCode: 'SBI-6201',
        formNaceCode: '62.010',
        restoredYearlyFinancials: [{ year: '2026', revenue: 120, ebitda: 12 }],
      })
    ).toMatchObject({
      companyName: 'Acme',
      businessStructure: 'bv',
      ownerManagers: 2,
      fteEmployees: 7,
      naceCode: 'SBI-6201',
      canonicalNaceCode: '62.010',
      current_year_data: { year: 2026, revenue: 120, ebitda: 12 },
      filingYearConfirmed: true,
      yearlyFinancials: [{ year: '2026', revenue: 120, ebitda: 12 }],
    })
  })

  it('falls back to collected owner count when the store count is empty', () => {
    expect(
      buildManualInputInitialData({
        collectedData: { ownerManagers: 3 },
        formStoreData: { number_of_owners: 0 },
      }).ownerManagers
    ).toBe(3)
  })

  it('merges live submit data over initial data and fills required defaults', () => {
    expect(
      buildManualLiveValuationSubmitData({
        initialData: {
          companyName: 'Initial',
          businessType: 'retail',
          businessStructure: 'company',
          industry: 'services',
          country: 'BE',
          yearFounded: '2010',
          ownerManagers: 2,
          fteEmployees: 5,
          yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
        },
        liveData: {
          companyName: 'Live',
          fteEmployees: undefined,
          yearlyFinancials: [{ year: '2026', revenue: 120, ebitda: 12 }],
        },
        fallbackYearlyFinancials: [{ year: '2024', revenue: 90, ebitda: 9 }],
      })
    ).toMatchObject({
      companyName: 'Live',
      businessType: 'retail',
      businessStructure: 'company',
      ownerManagers: 2,
      fteEmployees: 5,
      yearlyFinancials: [{ year: '2026', revenue: 120, ebitda: 12 }],
    })
  })

  it('uses fallback yearly financials when neither initial nor live data has rows', () => {
    expect(
      buildManualLiveValuationSubmitData({
        initialData: {},
        liveData: null,
        fallbackYearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
      })
    ).toMatchObject({
      companyName: '',
      businessType: '',
      businessStructure: '',
      industry: '',
      country: '',
      yearFounded: '',
      ownerManagers: 1,
      fteEmployees: 0,
      yearlyFinancials: [{ year: '2025', revenue: 100, ebitda: 10 }],
    })
  })
})
