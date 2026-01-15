/**
 * Manual Flow - Form Store
 *
 * Manages form state for the manual valuation flow.
 * Isolated from conversational flow to prevent race conditions.
 *
 * Key Features:
 * - Atomic functional updates (no race conditions)
 * - Form validation state
 * - isDirty tracking for autosave
 * - Business card prefill support
 *
 * @module store/manual/useManualFormStore
 */

import { create } from 'zustand'
import type { ValuationFormData } from '../../types/valuation'
import { storeLogger } from '../../utils/logger'

interface ManualFormStore {
  // Form state
  formData: ValuationFormData
  isDirty: boolean
  isValidating: boolean
  validationErrors: Record<string, string>

  // Actions (all atomic with functional updates)
  updateFormData: (updates: Partial<ValuationFormData>) => void
  setValidationErrors: (errors: Record<string, string>) => void
  resetForm: () => void
  prefillFromBusinessCard: (businessCard: {
    company_name: string
    industry: string
    business_model: string
    founding_year: number
    country_code: string
    employee_count?: number
  }) => void
  markClean: () => void
}

// Helper to get safe last full year (last completed fiscal year, max 2100 per backend validation)
// Valuations use the most recent completed fiscal year, not the current calendar year
const getSafeCurrentYear = () => Math.min(new Date().getFullYear() - 1, 2100)

const defaultFormData: ValuationFormData = {
  company_name: '', // Empty by default - user must enter company name
  country_code: 'BE',
  industry: 'services', // Default to valid industry code
  business_model: 'services', // Default business model (matches Python enum)
  founding_year: getSafeCurrentYear() - 5, // Default to 5 years ago
  business_type: 'company',
  shares_for_sale: 100,
  number_of_owners: 1, // Default to 1 owner
  revenue: undefined,
  ebitda: undefined,
  current_year_data: {
    year: getSafeCurrentYear(),
    revenue: 0,
    ebitda: 0,
  },
}

export const useManualFormStore = create<ManualFormStore>((set, get) => ({
  // Initial state
  formData: defaultFormData,
  isDirty: false,
  isValidating: false,
  validationErrors: {},

  // Update form data (atomic with functional update)
  updateFormData: (updates: Partial<ValuationFormData>) => {
    set((state) => {
      const updatedFormData = { ...state.formData, ...updates }

      storeLogger.debug('[Manual] Form data updated', {
        fieldsUpdated: Object.keys(updates),
        formId: 'manual',
      })

      return {
        ...state,
        formData: updatedFormData,
        isDirty: true, // Mark as dirty for autosave
      }
    })
  },

  // Set validation errors (atomic)
  setValidationErrors: (errors: Record<string, string>) => {
    set((state) => ({
      ...state,
      validationErrors: errors,
    }))

    storeLogger.debug('[Manual] Validation errors updated', {
      errorCount: Object.keys(errors).length,
      formId: 'manual',
    })
  },

  // Reset form data to defaults (atomic)
  resetForm: () => {
    set((state) => ({
      ...state,
      formData: defaultFormData,
      isDirty: false,
      validationErrors: {},
    }))

    storeLogger.info('[Manual] Form data reset', {
      formId: 'manual',
    })
  },

  // Pre-fill form data with business card data (atomic)
  prefillFromBusinessCard: (businessCard: {
    company_name: string
    industry: string
    business_model: string
    founding_year: number
    country_code: string
    employee_count?: number
  }) => {
    set((state) => {
      const updatedFormData = {
        ...state.formData,
        company_name: businessCard.company_name,
        industry: businessCard.industry,
        business_model: businessCard.business_model,
        founding_year: businessCard.founding_year,
        country_code: businessCard.country_code,
        number_of_employees: businessCard.employee_count,
      }

      storeLogger.info('[Manual] Form data prefilled from business card', {
        companyName: businessCard.company_name,
        formId: 'manual',
      })

      return {
        ...state,
        formData: updatedFormData,
        isDirty: true,
      }
    })
  },

  // Mark form as clean (atomic)
  markClean: () => {
    set((state) => ({
      ...state,
      isDirty: false,
    }))
  },
}))
