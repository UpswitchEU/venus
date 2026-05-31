import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BusinessType } from '@/design-system'
import { naceBusinessTypeService } from '../../../services/naceBusinessTypeService'
import type { ManualValuationFormData } from '../../../types/valuation'
import { useManualNaceBusinessTypePrefill } from './useManualNaceBusinessTypePrefill'

vi.mock('../../../services/naceBusinessTypeService', () => ({
  naceBusinessTypeService: {
    getBusinessTypeForNaceCode: vi.fn(),
  },
}))

const fintechType: BusinessType = {
  id: 'fintech-lending-credit',
  code: 'fintech-lending-credit',
  name: 'Fintech - Lending & Credit',
  category: 'Financial Services',
  icon: (() => null) as unknown as BusinessType['icon'],
  emoji: 'money',
  popular: false,
}

describe('useManualNaceBusinessTypePrefill', () => {
  it('syncs background NACE business-type resolution into the canonical form store', async () => {
    vi.mocked(naceBusinessTypeService.getBusinessTypeForNaceCode).mockResolvedValueOnce(fintechType)
    const setFormData = vi.fn()
    const setSelectedBusinessType = vi.fn()
    const updateFormData = vi.fn()

    renderHook(() =>
      useManualNaceBusinessTypePrefill({
        businessTypesForSearch: [fintechType],
        formData: {
          businessType: '',
          canonicalNaceCode: '64.191',
          country: 'BE',
        } as ManualValuationFormData,
        localizeActivityCodeCopy: (copy) => copy,
        selectedBusinessTypeId: undefined,
        selectedCompany: null,
        setFormData,
        setSelectedBusinessType,
        translate: (key) => key,
        updateFormData,
      })
    )

    await waitFor(() =>
      expect(updateFormData).toHaveBeenCalledWith({
        business_type_id: 'fintech-lending',
        industry: 'Financial Services',
      })
    )
    expect(setSelectedBusinessType).toHaveBeenCalled()
    expect(setFormData).toHaveBeenCalled()
  })
})
