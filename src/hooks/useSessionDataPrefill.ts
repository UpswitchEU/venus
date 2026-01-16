/**
 * useSessionDataPrefill Hook
 *
 * Prefill form from session data (Mercury → Venus flow)
 * 
 * This runs BEFORE auth-based prefill and handles the case where
 * business card data comes from Mercury via sessionData, not from
 * the authenticated user's profile.
 * 
 * Critical for accountant → client flow where client opens Venus
 * through Mercury-generated link with pre-populated business data.
 * 
 * @module hooks/useSessionDataPrefill
 */

import { useEffect, useRef } from 'react'
import { useManualFormStore } from '../store/manual'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationFormData } from '../types/valuation'
import { generalLogger } from '../utils/logger'

/**
 * Hook to prefill form from session data
 * 
 * Priority: Runs FIRST, before auth-based prefill
 * Source: sessionData from Mercury (via Titan API)
 * 
 * When accountant creates client in Mercury with KBO data:
 * 1. Mercury stores business card in users table
 * 2. Mercury generates valuation link with sessionData
 * 3. Venus loads session and this hook prefills form
 * 
 * This ensures client sees pre-filled form even though they're
 * not authenticated as themselves.
 */
export function useSessionDataPrefill() {
  const sessionData = useSessionStore((state) => state.session?.sessionData) as any
  const { updateFormData, formData } = useManualFormStore()
  const hasPrefilledRef = useRef(false)

  useEffect(() => {
    // Skip if no session data or already prefilled
    if (!sessionData || hasPrefilledRef.current) {
      return
    }

    // Check if sessionData has business card fields from Mercury
    const hasBusinessCardData = !!(
      sessionData.company_name ||
      sessionData.business_type_id ||
      sessionData.kbo_number ||
      sessionData.founding_year
    )

    if (!hasBusinessCardData) {
      generalLogger.debug('[useSessionDataPrefill] No business card data in sessionData')
      return
    }

    // Check if form is already filled (don't override user input)
    if (formData.company_name && formData.company_name.trim() !== '') {
      generalLogger.debug('[useSessionDataPrefill] Form already filled, skipping prefill')
      return
    }

    // Build updates object with all available fields
    const updates: Partial<ValuationFormData> = {}

    // Basic company information
    if (sessionData.company_name) updates.company_name = sessionData.company_name
    if (sessionData.business_type_id) updates.business_type_id = sessionData.business_type_id
    if (sessionData.founding_year) updates.founding_year = sessionData.founding_year
    if (sessionData.country_code) updates.country_code = sessionData.country_code
    if (sessionData.city) updates.city = sessionData.city
    if (sessionData.postal_code) updates.postal_code = sessionData.postal_code
    if (sessionData.number_of_employees)
      updates.number_of_employees = sessionData.number_of_employees
    if (sessionData.business_description)
      updates.business_description = sessionData.business_description
    if (sessionData.industry) updates.industry = sessionData.industry
    if (sessionData.business_model) updates.business_model = sessionData.business_model

    // KBO registry fields (Phase 1.1 enhancement)
    if (sessionData.kbo_number) updates.kbo_number = sessionData.kbo_number
    if (sessionData.vat_number) updates.vat_number = sessionData.vat_number
    if (sessionData.legal_form) updates.legal_form = sessionData.legal_form
    if (sessionData.nace_code) updates.nace_code = sessionData.nace_code
    if (sessionData.nace_description) updates.nace_description = sessionData.nace_description

    // Apply updates if we have any
    if (Object.keys(updates).length > 0) {
      updateFormData(updates)
      hasPrefilledRef.current = true

      generalLogger.info('[useSessionDataPrefill] Form prefilled from Mercury session data', {
        fields: Object.keys(updates),
        source: 'mercury_session_data',
        company_name: updates.company_name,
        has_kbo_data: !!(updates.kbo_number || updates.vat_number),
      })
    }
  }, [sessionData, formData.company_name, updateFormData])
}
