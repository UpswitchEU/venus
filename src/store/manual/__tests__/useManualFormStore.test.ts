/**
 * Unit Tests for useManualFormStore
 *
 * Tests atomic operations, form state management, and validation.
 *
 * @module store/manual/__tests__/useManualFormStore.test.ts
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { useManualFormStore } from '../useManualFormStore'

describe('useManualFormStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { resetForm } = useManualFormStore.getState()
    resetForm()
  })

  describe('Initial State', () => {
    it('should have default form data', () => {
      const { result } = renderHook(() => useManualFormStore())

      expect(result.current.formData).toBeDefined()
      expect(result.current.formData.country_code).toBe('')
      expect(result.current.formData.industry).toBe('services')
      expect(result.current.formData.business_model).toBe('services')
      expect(result.current.formData.business_type).toBe('company')
      expect(result.current.formData.shares_for_sale).toBe(100)
      expect(result.current.formData.number_of_owners).toBe(1)
      expect(result.current.formData.current_year_data?.year).toBe(getCurrentFilingYear())
    })

    it('should not be dirty initially', () => {
      const { result } = renderHook(() => useManualFormStore())

      expect(result.current.isDirty).toBe(false)
    })

    it('should not be validating initially', () => {
      const { result } = renderHook(() => useManualFormStore())

      expect(result.current.isValidating).toBe(false)
    })

    it('should have no validation errors initially', () => {
      const { result } = renderHook(() => useManualFormStore())

      expect(result.current.validationErrors).toEqual({})
    })
  })

  describe('updateFormData', () => {
    it('should update form data atomically', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
      })

      expect(result.current.formData.company_name).toBe('Test Corp')
    })

    it('should mark form as dirty after update', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
      })

      expect(result.current.isDirty).toBe(true)
    })

    it('should update multiple fields atomically', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({
          company_name: 'Test Corp',
          revenue: 1000000,
          ebitda: 100000,
        })
      })

      expect(result.current.formData.company_name).toBe('Test Corp')
      expect(result.current.formData.revenue).toBe(1000000)
      expect(result.current.formData.ebitda).toBe(100000)
    })

    it('should update business_type_id for business type dropdown', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ business_type_id: 'restaurant' })
      })

      expect(result.current.formData.business_type_id).toBe('restaurant')
    })

    it('should update country_code for Netherlands operating country', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ country_code: 'NL' })
      })

      expect(result.current.formData.country_code).toBe('NL')
    })

    it('should preserve existing fields when updating', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
      })

      act(() => {
        result.current.updateFormData({ revenue: 1000000 })
      })

      expect(result.current.formData.company_name).toBe('Test Corp')
      expect(result.current.formData.revenue).toBe(1000000)
    })

    it('removes activity_code and activity_label from formData when updated with undefined', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({
          activity_code: '62010',
          activity_label: 'Software development',
        })
      })

      expect(result.current.formData.activity_code).toBe('62010')
      expect(result.current.formData.activity_label).toBe('Software development')

      act(() => {
        result.current.updateFormData({
          activity_code: undefined,
          activity_label: undefined,
        })
      })

      expect('activity_code' in result.current.formData).toBe(false)
      expect('activity_label' in result.current.formData).toBe(false)
    })

    it('still assigns undefined for other optional fields (not activity presentation)', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ business_type_id: 'x' })
      })
      act(() => {
        result.current.updateFormData({ business_type_id: undefined })
      })

      expect(result.current.formData.business_type_id).toBeUndefined()
    })
  })

  describe('setValidationErrors', () => {
    it('should set validation errors', () => {
      const { result } = renderHook(() => useManualFormStore())

      const errors = { company_name: 'Required', revenue: 'Must be positive' }

      act(() => {
        result.current.setValidationErrors(errors)
      })

      expect(result.current.validationErrors).toEqual(errors)
    })

    it('should replace existing validation errors', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.setValidationErrors({ company_name: 'Required' })
      })

      act(() => {
        result.current.setValidationErrors({ revenue: 'Must be positive' })
      })

      expect(result.current.validationErrors).toEqual({ revenue: 'Must be positive' })
    })
  })

  describe('resetForm', () => {
    it('should reset form data to defaults', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp', revenue: 1000000 })
      })

      act(() => {
        result.current.resetForm()
      })

      expect(result.current.formData.company_name).toBe('')
      expect(result.current.formData.revenue).toBeUndefined()
    })

    it('should mark form as clean after reset', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
      })

      act(() => {
        result.current.resetForm()
      })

      expect(result.current.isDirty).toBe(false)
    })

    it('should clear validation errors after reset', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.setValidationErrors({ company_name: 'Required' })
      })

      act(() => {
        result.current.resetForm()
      })

      expect(result.current.validationErrors).toEqual({})
    })
  })

  describe('prefillFromBusinessCard', () => {
    it('should prefill form data from business card', async () => {
      const { result } = renderHook(() => useManualFormStore())

      const businessCard = {
        company_name: 'Business Card Corp',
        industry: 'technology',
        business_model: 'b2b_saas',
        founding_year: 2020,
        country_code: 'US',
        employee_count: 50,
      }

      act(() => {
        result.current.prefillFromBusinessCard(businessCard)
      })

      await waitFor(
        () => {
          expect(result.current.formData.company_name).toBe('Business Card Corp')
          expect(result.current.formData.industry).toBe('technology')
          expect(result.current.formData.business_model).toBe('b2b_saas')
          expect(result.current.formData.founding_year).toBe(2020)
          expect(result.current.formData.country_code).toBe('US')
          expect(result.current.formData.number_of_employees).toBe(50)
        },
        { timeout: 500 }
      )
    })

    it('should mark form as dirty after prefill', async () => {
      const { result } = renderHook(() => useManualFormStore())

      const businessCard = {
        company_name: 'Business Card Corp',
        industry: 'technology',
        business_model: 'b2b_saas',
        founding_year: 2020,
        country_code: 'US',
      }

      // Wait for any previous prefill's guard to reset (prefillInProgress uses setTimeout(100))
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150))
      })

      act(() => {
        result.current.prefillFromBusinessCard(businessCard)
      })

      await waitFor(() => expect(result.current.isDirty).toBe(true), { timeout: 500 })
    })
  })

  describe('markClean', () => {
    it('should mark form as clean', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
      })

      act(() => {
        result.current.markClean()
      })

      expect(result.current.isDirty).toBe(false)
    })

    it('should preserve form data when marking clean', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
      })

      act(() => {
        result.current.markClean()
      })

      expect(result.current.formData.company_name).toBe('Test Corp')
    })
  })

  describe('Atomic Operations', () => {
    it('should handle concurrent updates atomically', () => {
      const { result } = renderHook(() => useManualFormStore())

      // Simulate concurrent updates
      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp 1' })
        result.current.updateFormData({ company_name: 'Test Corp 2' })
        result.current.updateFormData({ company_name: 'Test Corp 3' })
      })

      // Last update should win
      expect(result.current.formData.company_name).toBe('Test Corp 3')
    })

    it('should maintain state consistency across multiple operations', () => {
      const { result } = renderHook(() => useManualFormStore())

      act(() => {
        result.current.updateFormData({ company_name: 'Test Corp' })
        result.current.setValidationErrors({ revenue: 'Required' })
        result.current.updateFormData({ revenue: 1000000 })
        result.current.setValidationErrors({})
      })

      expect(result.current.formData.company_name).toBe('Test Corp')
      expect(result.current.formData.revenue).toBe(1000000)
      expect(result.current.validationErrors).toEqual({})
      expect(result.current.isDirty).toBe(true)
    })
  })
})
