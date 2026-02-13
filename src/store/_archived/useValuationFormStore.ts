/**
 * Valuation Form Store
 *
 * Manages form data state for valuation inputs.
 * Single Responsibility: Form data management and validation.
 *
 * Split from monolithic useValuationStore to follow SRP.
 * Used by manual forms, conversational flows, and data collection components.
 */

import { create } from 'zustand'
import type { DataResponse } from '../types/data-collection'
import type { ValuationFormData } from '../types/valuation'
import { storeLogger } from '../utils/logger'

interface ValuationFormStore {
  // Form data state
  formData: ValuationFormData
  collectedData: DataResponse[]

  // Actions
  updateFormData: (data: Partial<ValuationFormData>) => void
  setCollectedData: (data: DataResponse[]) => void
  resetFormData: () => void
  prefillFromBusinessCard: (businessCard: {
    company_name: string
    industry: string
    business_model: string
    founding_year: number
    country_code: string
    employee_count?: number
  }) => void
}

// Helper to get safe current year (allow up to current year, max 2100 per backend validation)
const getSafeCurrentYear = () => Math.min(new Date().getFullYear(), 2100)

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

export const useValuationFormStore = create<ValuationFormStore>((set, get) => ({
  // Initial state
  formData: defaultFormData,
  collectedData: [],

  // Update form data (merge with existing)
  updateFormData: (data: Partial<ValuationFormData>) => {
    set((state) => ({
      formData: { ...state.formData, ...data },
    }))
    storeLogger.debug('Form data updated', {
      fieldsUpdated: Object.keys(data),
    })
  },

  // Set collected data (for conversational flow)
  setCollectedData: (data: DataResponse[]) => {
    set({ collectedData: data })
    storeLogger.debug('Collected data updated', {
      responseCount: data.length,
    })
  },

  // Reset form data to defaults
  resetFormData: () => {
    set({
      formData: defaultFormData,
      collectedData: [],
    })
    storeLogger.debug('Form data reset')
  },

  // Pre-fill form data with business card data
  prefillFromBusinessCard: (businessCard: {
    company_name: string
    industry: string
    business_model: string
    founding_year: number
    country_code: string
    employee_count?: number
  }) => {
    set((state) => ({
      formData: {
        ...state.formData,
        company_name: businessCard.company_name,
        industry: businessCard.industry,
        business_model: businessCard.business_model,
        founding_year: businessCard.founding_year,
        country_code: businessCard.country_code,
        number_of_employees: businessCard.employee_count,
      },
    }))
    storeLogger.debug('Form data prefilled from business card', {
      companyName: businessCard.company_name,
    })
  },
}))
