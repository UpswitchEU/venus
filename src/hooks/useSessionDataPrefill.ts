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
    // Skip if no session data
    if (!sessionData) {
      return
    }
    
    // ✅ FIX: Reset hasPrefilledRef if sessionData changes significantly
    // This allows re-prefill if business card data arrives later
    const hasCompanyNameInSession = !!(sessionData.company_name || sessionData._businessInfo?.company_name)
    if (hasCompanyNameInSession && hasPrefilledRef.current && !formData.company_name?.trim()) {
      // Business card data arrived but wasn't prefilled - reset flag to allow prefill
      generalLogger.debug('[useSessionDataPrefill] Resetting prefill flag - business card data available but form empty', {
        hasSessionCompanyName: hasCompanyNameInSession,
        formCompanyName: formData.company_name,
      })
      hasPrefilledRef.current = false
    }
    
    // Skip if already prefilled (unless we just reset the flag above)
    if (hasPrefilledRef.current) {
      return
    }

    // ✅ BANK GRADE FIX: Check both top-level fields AND _businessInfo
    // Sessions created via generateValuationLink store data under _businessInfo
    // Sessions created via regular create endpoint store data at top level
    const businessInfo = sessionData._businessInfo || {}
    const topLevelData = sessionData

    // Merge both sources, with top-level taking precedence
    const mergedData = {
      ...businessInfo,
      ...topLevelData, // Top-level overrides _businessInfo
    }

    // Check if merged data has business card fields from Mercury
    const hasBusinessCardData = !!(
      mergedData.company_name ||
      mergedData.business_type_id ||
      mergedData.business_type ||
      mergedData.kbo_number ||
      mergedData.founding_year ||
      mergedData.founded_year
    )

    // ✅ DEBUG: Log what we found in sessionData
    generalLogger.debug('[useSessionDataPrefill] Checking sessionData for business card fields', {
      hasBusinessCardData,
      hasTopLevelCompanyName: !!topLevelData.company_name,
      topLevelCompanyName: topLevelData.company_name,
      hasBusinessInfoCompanyName: !!businessInfo.company_name,
      businessInfoCompanyName: businessInfo.company_name,
      mergedDataCompanyName: mergedData.company_name,
      mergedDataBusinessTypeId: mergedData.business_type_id,
      sessionDataKeys: Object.keys(sessionData).slice(0, 10),
      topLevelKeys: Object.keys(topLevelData).filter(k => !k.startsWith('_')).slice(0, 10),
      businessInfoKeys: Object.keys(businessInfo).slice(0, 10),
    })

    if (!hasBusinessCardData) {
      generalLogger.debug('[useSessionDataPrefill] No business card data in sessionData', {
        hasTopLevel: !!topLevelData.company_name,
        hasBusinessInfo: !!businessInfo.company_name,
        keys: Object.keys(sessionData),
      })
      return
    }

    // ✅ FIX: Check if critical fields are missing, not just company_name
    // Even if form has some data (like industry), we should prefill missing critical fields
    const hasCompanyName = formData.company_name && formData.company_name.trim() !== ''
    const hasBusinessTypeId = formData.business_type_id && formData.business_type_id !== ''
    
    // Only skip if BOTH critical fields are filled (user has entered data)
    if (hasCompanyName && hasBusinessTypeId) {
      generalLogger.debug('[useSessionDataPrefill] Form already filled, skipping prefill', {
        hasCompanyName,
        hasBusinessTypeId,
      })
      return
    }

    // Build updates object with all available fields from merged data
    const updates: Partial<ValuationFormData> = {}

    // ✅ FIX: Always prefill critical fields if they're missing, even if form has other data
    // Basic company information
    // ✅ CRITICAL FIX: Check mergedData.company_name exists and is not empty before prefilling
    if (mergedData.company_name && mergedData.company_name.trim() !== '' && !hasCompanyName) {
      updates.company_name = mergedData.company_name.trim()
      generalLogger.debug('[useSessionDataPrefill] Will prefill company_name', {
        company_name: mergedData.company_name,
        hasCompanyName,
        mergedDataKeys: Object.keys(mergedData),
      })
    } else {
      generalLogger.debug('[useSessionDataPrefill] Skipping company_name prefill', {
        hasMergedDataCompanyName: !!mergedData.company_name,
        mergedDataCompanyName: mergedData.company_name,
        hasCompanyName,
        formCompanyName: formData.company_name,
      })
    }
    if (mergedData.business_type_id && !hasBusinessTypeId) {
      updates.business_type_id = mergedData.business_type_id
    }
    if (mergedData.business_type && !updates.business_type_id) {
      // Fallback: use business_type if business_type_id not available
      updates.business_type_id = mergedData.business_type
    }
    if (mergedData.founding_year) updates.founding_year = mergedData.founding_year
    if (mergedData.founded_year && !updates.founding_year) {
      // Fallback: use founded_year if founding_year not available
      updates.founding_year = mergedData.founded_year
    }
    if (mergedData.country_code) updates.country_code = mergedData.country_code
    if (mergedData.country && !updates.country_code) {
      // Fallback: use country if country_code not available
      updates.country_code = mergedData.country
    }
    if (mergedData.city) updates.city = mergedData.city
    if (mergedData.postal_code) updates.postal_code = mergedData.postal_code
    if (mergedData.number_of_employees)
      updates.number_of_employees = mergedData.number_of_employees
    if (mergedData.employee_count && !updates.number_of_employees) {
      // Fallback: use employee_count if number_of_employees not available
      updates.number_of_employees = mergedData.employee_count
    }
    if (mergedData.business_description)
      updates.business_description = mergedData.business_description
    if (mergedData.industry) updates.industry = mergedData.industry
    if (mergedData.business_model) updates.business_model = mergedData.business_model

    // KBO registry fields (Phase 1.1 enhancement)
    if (mergedData.kbo_number) updates.kbo_number = mergedData.kbo_number
    if (mergedData.vat_number) updates.vat_number = mergedData.vat_number
    if (mergedData.legal_form) updates.legal_form = mergedData.legal_form
    if (mergedData.nace_code) updates.nace_code = mergedData.nace_code
    if (mergedData.nace_description) updates.nace_description = mergedData.nace_description

    // Apply updates if we have any
    if (Object.keys(updates).length > 0) {
      updateFormData(updates)
      hasPrefilledRef.current = true

      generalLogger.info('[useSessionDataPrefill] Form prefilled from Mercury session data', {
        fields: Object.keys(updates),
        source: businessInfo.company_name ? '_businessInfo' : 'top_level',
        company_name: updates.company_name,
        has_kbo_data: !!(updates.kbo_number || updates.vat_number),
        data_source: {
          from_business_info: Object.keys(businessInfo).length,
          from_top_level: Object.keys(topLevelData).filter(k => !k.startsWith('_')).length,
        },
      })
    }
  }, [sessionData, formData.company_name, formData.business_type_id, updateFormData])
}
