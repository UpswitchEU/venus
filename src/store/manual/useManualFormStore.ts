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
import { getCurrentFilingYear } from '../../utils/fiscalYear'
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

// Valuations should default to the latest realistically filed year, not the calendar year.
const getSafeCurrentFilingYear = () => {
  return Math.min(getCurrentFilingYear(), 2100)
}

function getDefaultFormData(): ValuationFormData {
  const filing = getSafeCurrentFilingYear()
  return {
    company_name: '', // Empty by default - user must enter company name
    country_code: '',
    industry: 'services', // Default to valid industry code
    business_model: 'services', // Default business model (matches Python enum)
    founding_year: filing - 5, // Default to 5 years before filing year
    business_type: 'company',
    shares_for_sale: 100,
    number_of_owners: 1, // Default to 1 owner
    revenue: undefined,
    ebitda: undefined,
    current_year_data: {
      year: filing,
      revenue: 0,
      ebitda: 0,
    },
  }
}

export const useManualFormStore = create<ManualFormStore>((set, get) => ({
  // Initial state
  formData: getDefaultFormData(),
  isDirty: false,
  isValidating: false,
  validationErrors: {},

  // Update form data (atomic with functional update)
  updateFormData: (updates: Partial<ValuationFormData>) => {
    set((state) => {
      const next: ValuationFormData = { ...state.formData }
      const mutable = next as unknown as Record<string, unknown>

      for (const key of Object.keys(updates) as Array<keyof ValuationFormData>) {
        const value = updates[key]
        // The product narrative now always values 100% of the business.
        // Keep store state normalized even when legacy sessions/package payloads
        // still contain partial share values.
        if (key === 'shares_for_sale') {
          mutable[key as string] = 100
          continue
        }
        // Undefined removes market presentation keys so session autosave cannot keep a stale
        // NL SBI after switching registry rows or when display matches canonical NACE.
        if (value === undefined && (key === 'activity_code' || key === 'activity_label')) {
          delete mutable[key as string]
        } else {
          mutable[key as string] = value
        }
      }

      storeLogger.debug('[Manual] Form data updated', {
        fieldsUpdated: Object.keys(updates),
        formId: 'manual',
      })

      return {
        ...state,
        formData: next,
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
      formData: getDefaultFormData(),
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
          const hasIndustry =
            typeof businessCard.industry === 'string' && businessCard.industry.trim() !== ''
          const hasBusinessModel =
            typeof businessCard.business_model === 'string' &&
            businessCard.business_model.trim() !== ''
          const hasCountryCode =
            typeof businessCard.country_code === 'string' && businessCard.country_code.trim() !== ''
          const hasFoundingYear =
            typeof businessCard.founding_year === 'number' &&
            Number.isFinite(businessCard.founding_year)
          const hasEmployeeCount =
            typeof businessCard.employee_count === 'number' &&
            Number.isFinite(businessCard.employee_count)

          const updatedFormData = {
            ...state.formData,
            company_name: businessCard.company_name,
            ...(hasIndustry && { industry: businessCard.industry }),
            ...(hasBusinessModel && { business_model: businessCard.business_model }),
            ...(hasFoundingYear && { founding_year: businessCard.founding_year }),
            ...(hasCountryCode && { country_code: businessCard.country_code }),
            ...(hasEmployeeCount && { number_of_employees: businessCard.employee_count }),
            // Phase 1.1: Add KBO registry fields if available
            ...(businessCard.city && { city: businessCard.city }),
            ...(businessCard.postal_code && { postal_code: businessCard.postal_code }),
            ...(businessCard.kbo_number && { kbo_number: businessCard.kbo_number }),
            ...(businessCard.vat_number && { vat_number: businessCard.vat_number }),
            ...(businessCard.legal_form && { legal_form: businessCard.legal_form }),
            ...(businessCard.nace_code && { nace_code: businessCard.nace_code }),
            ...(businessCard.nace_description && {
              nace_description: businessCard.nace_description,
            }),
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
