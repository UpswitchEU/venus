/**
 * useSessionDataPrefill Hook
 *
 * @deprecated This hook is deprecated. Use useBootstrapPrefill instead.
 *
 * Bootstrap is now the SINGLE SOURCE OF TRUTH for all prefill data.
 * This hook is kept for backward compatibility but will always skip
 * when bootstrap has prefilled (which is the default behavior).
 *
 * The bootstrap system aggregates all prefill sources:
 * - KBO registry data
 * - User profile (business card)
 * - Session data from Mercury
 * - Client context for accountant flows
 *
 * @module hooks/useSessionDataPrefill
 */

import { useEffect, useRef } from 'react'
import { useBootstrapSafe } from '../lib/bootstrap'
import { looksLikeNaceCode, naceBusinessTypeService } from '../services/naceBusinessTypeService'
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
  const cancelledRef = useRef(false)
  const bootstrap = useBootstrapSafe()

  useEffect(() => {
    cancelledRef.current = false
    // MERCURY FIX: For existing reports, allow fallback when form is empty but session has data
    // Restoration (loadSession) is async - form may stay blank until it completes.
    // If session store has sessionData with company/KBO fields and form is empty, apply as fallback.
    const isExistingReport =
      bootstrap?.report?.mode === 'existing' && bootstrap?.report?.hasExistingData
    const formIsEmpty = !formData.company_name?.trim() && !formData.kbo_number?.trim()
    const sessionHasData = !!(
      sessionData?.company_name?.trim() ||
      sessionData?.kbo_number ||
      sessionData?._businessInfo?.company_name?.trim()
    )

    if (isExistingReport && !formIsEmpty) {
      // Form already has data - skip (restoration or bootstrap prefill already applied)
      generalLogger.debug(
        '[useSessionDataPrefill] Skipping - existing report, form already has data',
        {
          reportMode: bootstrap?.report?.mode,
        }
      )
      hasPrefilledRef.current = true
      return
    }

    if (isExistingReport && formIsEmpty && !sessionHasData) {
      // Form empty, session empty - wait for loadSession
      return
    }

    // Skip if bootstrap has already prefilled with meaningful data
    // Bootstrap is the primary source - only use session data as fallback
    if (
      bootstrap &&
      !bootstrap.isBootstrapping &&
      bootstrap.hasPrefilledData &&
      bootstrap.prefillData.confidence > 0.1
    ) {
      generalLogger.debug('[useSessionDataPrefill] Skipping - bootstrap already prefilled', {
        confidence: bootstrap.prefillData.confidence.toFixed(2),
        fields: bootstrap.prefillData.fieldsPopulated.length,
      })
      hasPrefilledRef.current = true
      return
    }

    // Skip if no session data
    if (!sessionData) {
      return
    }

    // ✅ FIX: Reset hasPrefilledRef if sessionData changes significantly
    // This allows re-prefill if business card data arrives later
    const hasCompanyNameInSession = !!(
      sessionData.company_name || sessionData._businessInfo?.company_name
    )
    if (hasCompanyNameInSession && hasPrefilledRef.current && !formData.company_name?.trim()) {
      // Business card data arrived but wasn't prefilled - reset flag to allow prefill
      generalLogger.debug(
        '[useSessionDataPrefill] Resetting prefill flag - business card data available but form empty',
        {
          hasSessionCompanyName: hasCompanyNameInSession,
          formCompanyName: formData.company_name,
        }
      )
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

    if (!hasBusinessCardData) {
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

    const runPrefill = async () => {
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
      // Reject NACE-shaped values: resolve via API instead of using raw value
      const rawBusinessType = mergedData.business_type_id || mergedData.business_type
      if (rawBusinessType && !hasBusinessTypeId) {
        if (looksLikeNaceCode(rawBusinessType)) {
          try {
            const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
              rawBusinessType.trim()
            )
            if (cancelledRef.current) return
            if (resolved?.id) {
              updates.business_type_id = resolved.id
              if (resolved.category) {
                updates.industry = resolved.category
              }
              generalLogger.debug('[useSessionDataPrefill] Resolved business_type_id from NACE', {
                nace_code: rawBusinessType,
                business_type_id: resolved.id,
              })
            }
          } catch (err) {
            generalLogger.debug(
              '[useSessionDataPrefill] NACE lookup failed, skipping business_type_id',
              {
                nace_code: rawBusinessType,
              }
            )
          }
        } else {
          updates.business_type_id = rawBusinessType
        }
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
      if (mergedData.industry && !updates.industry) updates.industry = mergedData.industry
      if (mergedData.business_model) updates.business_model = mergedData.business_model

      // KBO registry fields (Phase 1.1 enhancement)
      if (mergedData.kbo_number) updates.kbo_number = mergedData.kbo_number
      if (mergedData.vat_number) updates.vat_number = mergedData.vat_number
      if (mergedData.legal_form) updates.legal_form = mergedData.legal_form
      if (mergedData.nace_code) updates.nace_code = mergedData.nace_code
      if (mergedData.nace_description) updates.nace_description = mergedData.nace_description

      // business_context for KBO preview card (KBO fields extend ValuationRequest.business_context)
      if (mergedData.kbo_number) {
        updates.business_context = {
          kbo_registration: mergedData.kbo_number,
          kbo_registration_number: mergedData.kbo_number,
          legal_form: mergedData.legal_form,
          company_id: mergedData.kbo_number,
          company_address: [mergedData.postal_code, mergedData.city].filter(Boolean).join(' '),
          company_status: 'Active',
          kbo_verified: true,
        } as any
      }

      // Revenue prefill from latest valuation or current year data
      if (mergedData.current_year_data?.revenue) {
        updates.revenue = mergedData.current_year_data.revenue
      }

      // Apply updates if we have any (skip if effect re-ran or unmounted)
      if (!cancelledRef.current && Object.keys(updates).length > 0) {
        updateFormData(updates)
        hasPrefilledRef.current = true

        generalLogger.info('[useSessionDataPrefill] Form prefilled from Mercury session data', {
          fields: Object.keys(updates),
          source: businessInfo.company_name ? '_businessInfo' : 'top_level',
          company_name: updates.company_name,
          has_kbo_data: !!(updates.kbo_number || updates.vat_number),
          data_source: {
            from_business_info: Object.keys(businessInfo).length,
            from_top_level: Object.keys(topLevelData).filter((k) => !k.startsWith('_')).length,
          },
        })
      }
    }
    runPrefill()
    return () => {
      cancelledRef.current = true
    }
  }, [
    sessionData,
    formData.company_name,
    formData.business_type_id,
    updateFormData,
    bootstrap?.report?.mode,
    bootstrap?.report?.hasExistingData,
    bootstrap?.report?.hasValuationResult,
    bootstrap?.hasPrefilledData,
    bootstrap?.prefillData?.confidence,
  ])
}
