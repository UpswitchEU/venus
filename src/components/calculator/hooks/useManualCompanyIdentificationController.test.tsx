import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BusinessType as ApiBusinessType } from '../../../services/businessTypesApi'
import type { ManualValuationFormData } from '../../../types/valuation'
import { useManualCompanyIdentificationController } from './useManualCompanyIdentificationController'

const mocks = vi.hoisted(() => ({
  accountingType: {
    id: 'accounting',
    title: 'Accounting practice',
    description: '',
    icon: 'chart',
    category: 'Professional Services',
    category_id: 'professional-services',
    industryMapping: 'professional-services',
    keywords: [],
    popular: false,
    primaryMultiple: {
      label: 'EV/EBITDA',
      basis: 'EBITDA',
      median: 5.4,
    },
    status: 'active',
    createdAt: '',
    updatedAt: '',
  },
  clearNacePrefillError: vi.fn(),
  prefillBusinessTypeForCompany: vi.fn(),
  refetchBusinessTypes: vi.fn(),
  retryNacePrefill: vi.fn(),
  taxType: {
    id: 'tax-advisory',
    title: 'Tax advisory',
    description: '',
    icon: 'briefcase',
    category: 'Professional Services',
    category_id: 'professional-services',
    industryMapping: 'professional-services',
    keywords: [],
    popular: false,
    primaryMultiple: {
      label: 'EV/EBITDA',
      basis: 'EBITDA',
      median: 6.1,
    },
    status: 'active',
    createdAt: '',
    updatedAt: '',
  },
}))

const accountingType = mocks.accountingType as ApiBusinessType
const taxType = mocks.taxType as ApiBusinessType

vi.mock('../../../hooks/useBusinessTypes', () => ({
  useBusinessTypes: () => ({
    businessTypes: [mocks.accountingType, mocks.taxType],
    loading: false,
    error: null,
    refetch: mocks.refetchBusinessTypes,
  }),
}))

vi.mock('./useManualNaceBusinessTypePrefill', () => ({
  useManualNaceBusinessTypePrefill: () => ({
    clearNacePrefillError: mocks.clearNacePrefillError,
    nacePrefillError: null,
    prefillBusinessTypeForCompany: mocks.prefillBusinessTypeForCompany,
    retryNacePrefill: mocks.retryNacePrefill,
  }),
}))

function renderController(formData: ManualValuationFormData) {
  const setFormData = vi.fn()
  const updateFormData = vi.fn()
  const setSelectedCompany = vi.fn()
  const setCompanySearchValue = vi.fn()
  const setShowChangeCompanyWarning = vi.fn()

  const hook = renderHook(() =>
    useManualCompanyIdentificationController({
      executePrefillCompanyReset: vi.fn(),
      formData,
      initialCountry: 'BE',
      localizeActivityCodeCopy: (copy) => copy,
      prefillCompanyRef: { current: null },
      searchUnavailableMessage: 'Search unavailable',
      selectedCompany: null,
      setCompanySearchValue,
      setFormData,
      setSelectedCompany,
      setShowChangeCompanyWarning,
      translate: (key) => key,
      updateFormData,
    })
  )

  return {
    ...hook,
    setCompanySearchValue,
    setFormData,
    setSelectedCompany,
    setShowChangeCompanyWarning,
    updateFormData,
  }
}

const baseFormData = {
  businessType: '',
  companyName: '',
  country: 'BE',
  yearlyFinancials: [],
} as ManualValuationFormData

describe('useManualCompanyIdentificationController', () => {
  it('stores multi-select business types as canonical valuation segments', () => {
    const { result, setFormData, updateFormData } = renderController(baseFormData)

    act(() => {
      result.current.handleBusinessTypeSelectionChange(
        ['accounting', 'tax-advisory'],
        [accountingType, taxType]
      )
    })

    expect(updateFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        business_type_id: 'accounting',
        business_type_title: 'Accounting practice',
        business_type_segments: [
          expect.objectContaining({
            business_type_id: 'accounting',
            business_type_title: 'Accounting practice',
            basis: 'EBITDA',
            multiple: 5.4,
            weight: 50,
          }),
          expect.objectContaining({
            business_type_id: 'tax-advisory',
            business_type_title: 'Tax advisory',
            basis: 'EBITDA',
            multiple: 6.1,
            weight: 50,
          }),
        ],
      })
    )

    const localUpdater = setFormData.mock.calls.at(-1)?.[0]
    expect(typeof localUpdater).toBe('function')
    const nextFormData = localUpdater(baseFormData)
    expect(nextFormData).toMatchObject({
      businessType: 'accounting',
      business_type_id: 'accounting',
      business_type_segments: [
        expect.objectContaining({ business_type_id: 'accounting', multiple: 5.4, weight: 50 }),
        expect.objectContaining({ business_type_id: 'tax-advisory', multiple: 6.1, weight: 50 }),
      ],
    })
  })

  it('stores a single selected business type as a 100% segment', () => {
    const { result, updateFormData } = renderController(baseFormData)

    act(() => {
      result.current.handleBusinessTypeSelectionChange(['accounting'], [accountingType])
    })

    expect(updateFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        business_type_id: 'accounting',
        business_type_segments: [
          expect.objectContaining({
            business_type_id: 'accounting',
            weight: 100,
          }),
        ],
      })
    )
  })

  it('applies KBO-resolved multiple business types without falling back to single NACE prefill', async () => {
    const { result, updateFormData } = renderController(baseFormData)
    mocks.prefillBusinessTypeForCompany.mockClear()

    await act(async () => {
      await result.current.handleCompanySelect({
        id: 'kbo-123',
        name: 'Boekhoudkantoor Example',
        kboNumber: '0123.456.789',
        legalForm: 'BV',
        address: '',
        postalCode: '2000',
        city: 'Antwerpen',
        canonicalNaceCode: '69201',
        countryCode: 'BE',
        businessTypeIds: ['accounting', 'tax-advisory'],
        businessTypeCandidates: [
          { id: 'accounting', title: 'Accounting practice', naceCode: '69201', weight: 70 },
          { id: 'tax-advisory', title: 'Tax advisory', naceCode: '69202', weight: 30 },
        ],
      })
    })

    expect(mocks.prefillBusinessTypeForCompany).not.toHaveBeenCalled()
    expect(updateFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        business_type_id: 'accounting',
        business_type_segments: [
          expect.objectContaining({ business_type_id: 'accounting', weight: 70 }),
          expect.objectContaining({ business_type_id: 'tax-advisory', weight: 30 }),
        ],
      })
    )
  })
})
