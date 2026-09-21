import { act, renderHook, waitFor } from '@testing-library/react'
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

  // Regression: removing the only business type used to "stick" because clearing
  // it (businessType → '') re-triggered the background NACE prefill, which
  // immediately re-seeded the same type from the still-selected company's NACE
  // code. suppressNacePrefill() must block that re-seed until a new company is
  // picked or the user explicitly retries.
  it('does not re-seed after the user clears their selection', async () => {
    const getType = vi.mocked(naceBusinessTypeService.getBusinessTypeForNaceCode)
    getType.mockResolvedValue(fintechType)
    const setFormData = vi.fn()
    const setSelectedBusinessType = vi.fn()
    const updateFormData = vi.fn()

    const baseProps = {
      businessTypesForSearch: [fintechType],
      localizeActivityCodeCopy: (copy: string) => copy,
      selectedBusinessTypeId: undefined,
      selectedCompany: null,
      setFormData,
      setSelectedBusinessType,
      translate: (key: string) => key,
      updateFormData,
    }

    // Mount with a type already chosen: the NACE code is present but the
    // "businessType set" guard means no background prefill fires.
    const { result, rerender } = renderHook(
      (props: { businessType: string }) =>
        useManualNaceBusinessTypePrefill({
          ...baseProps,
          formData: {
            businessType: props.businessType,
            canonicalNaceCode: '64.191',
            country: 'BE',
          } as ManualValuationFormData,
        }),
      { initialProps: { businessType: 'fintech-lending' } }
    )
    expect(getType).not.toHaveBeenCalled()

    // User removes the selection: app suppresses prefill, then businessType clears.
    act(() => {
      result.current.suppressNacePrefill()
    })
    rerender({ businessType: '' })

    // Let any pending microtask settle — nothing should re-seed.
    await act(async () => {
      await Promise.resolve()
    })
    expect(getType).not.toHaveBeenCalled()
    expect(updateFormData).not.toHaveBeenCalled()
  })

  it('re-enables prefill after an explicit retry', async () => {
    const getType = vi.mocked(naceBusinessTypeService.getBusinessTypeForNaceCode)
    getType.mockResolvedValue(fintechType)
    const setFormData = vi.fn()
    const setSelectedBusinessType = vi.fn()
    const updateFormData = vi.fn()

    const baseProps = {
      businessTypesForSearch: [fintechType],
      localizeActivityCodeCopy: (copy: string) => copy,
      selectedBusinessTypeId: undefined,
      selectedCompany: null,
      setFormData,
      setSelectedBusinessType,
      translate: (key: string) => key,
      updateFormData,
    }

    const { result, rerender } = renderHook(
      (props: { businessType: string }) =>
        useManualNaceBusinessTypePrefill({
          ...baseProps,
          formData: {
            businessType: props.businessType,
            canonicalNaceCode: '64.191',
            country: 'BE',
          } as ManualValuationFormData,
        }),
      { initialProps: { businessType: 'fintech-lending' } }
    )

    act(() => {
      result.current.suppressNacePrefill()
    })
    rerender({ businessType: '' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(getType).not.toHaveBeenCalled()

    // Explicit retry clears the suppression and re-runs the lookup.
    act(() => {
      result.current.retryNacePrefill()
    })
    await waitFor(() => expect(getType).toHaveBeenCalled())
  })
  it('ignores late registry business-type enrichment after an advisor chooses a type', async () => {
    let resolve!: (type: BusinessType) => void
    vi.mocked(naceBusinessTypeService.getBusinessTypeForNaceCode).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const updateFormData = vi.fn()
    const { result } = renderHook(() =>
      useManualNaceBusinessTypePrefill({
        businessTypesForSearch: [fintechType],
        formData: {
          companyName: 'Manual company',
          businessType: '',
          country: 'BE',
        } as ManualValuationFormData,
        localizeActivityCodeCopy: (copy) => copy,
        selectedBusinessTypeId: undefined,
        selectedCompany: null,
        setFormData: vi.fn(),
        setSelectedBusinessType: vi.fn(),
        translate: (key) => key,
        updateFormData,
      })
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.prefillBusinessTypeForCompany(
        { name: 'Registry company', countryCode: 'BE' } as never,
        {},
        '64.191'
      )
    })
    act(() => result.current.suppressNacePrefill())
    await act(async () => {
      resolve(fintechType)
      await pending
    })
    expect(updateFormData).not.toHaveBeenCalled()
  })
})
