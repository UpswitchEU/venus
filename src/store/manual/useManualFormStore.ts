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

// ✅ FIX: Guard to prevent multiple simultaneous calls to prefillFromBusinessCard
// This prevents React error #185 when multiple hooks call it simultaneously
let prefillInProgress = false

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
    // Phase 1.1: Enhanced KBO registry fields
    kbo_number?: string
    vat_number?: string
    city?: string
    postal_code?: string
    legal_form?: string
    nace_code?: string
    nace_description?: string
  }) => void
  markClean: () => void
}

// Helper to get safe last full year (last completed fiscal year, max 2100 per backend validation)
// Valuations use the most recent completed fiscal year, not the current calendar year
const getSafeCurrentYear = () => {
  return Math.min(new Date().getFullYear() - 1, 2100);
}

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
  // ✅ FIX: Add guard to prevent multiple simultaneous calls (React error #185)
  prefillFromBusinessCard: (businessCard: {
    company_name: string
    industry: string
    business_model: string
    founding_year: number
    country_code: string
    employee_count?: number
    // Phase 1.1: Enhanced KBO registry fields
    kbo_number?: string
    vat_number?: string
    city?: string
    postal_code?: string
    legal_form?: string
    nace_code?: string
    nace_description?: string
  }) => {
    // ✅ FIX: Guard against multiple simultaneous calls
    if (prefillInProgress) {
      storeLogger.debug('[Manual] Prefill already in progress, skipping duplicate call', {
        companyName: businessCard.company_name,
      })
      return
    }

    prefillInProgress = true

    // ✅ FIX: Use requestAnimationFrame to ensure we're not in render phase
    // This prevents React error #185 by ensuring state updates happen after render
    requestAnimationFrame(() => {
      try {
        set((state) => {
          const updatedFormData = {
            ...state.formData,
            company_name: businessCard.company_name,
            industry: businessCard.industry,
            business_model: businessCard.business_model,
            founding_year: businessCard.founding_year,
            country_code: businessCard.country_code,
            number_of_employees: businessCard.employee_count,
            // Phase 1.1: Add KBO registry fields if available
            ...(businessCard.city && { city: businessCard.city }),
            ...(businessCard.postal_code && { postal_code: businessCard.postal_code }),
            ...(businessCard.kbo_number && { kbo_number: businessCard.kbo_number }),
            ...(businessCard.vat_number && { vat_number: businessCard.vat_number }),
            ...(businessCard.legal_form && { legal_form: businessCard.legal_form }),
            ...(businessCard.nace_code && { nace_code: businessCard.nace_code }),
            ...(businessCard.nace_description && { nace_description: businessCard.nace_description }),
          }

          storeLogger.info('[Manual] Form data prefilled from business card', {
            companyName: businessCard.company_name,
            hasKboData: !!(businessCard.kbo_number || businessCard.vat_number),
            formId: 'manual',
          })

          return {
            ...state,
            formData: updatedFormData,
            isDirty: true,
          }
        })
      } finally {
        // Reset guard after a short delay to allow the update to complete
        setTimeout(() => {
          prefillInProgress = false
        }, 100)
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
