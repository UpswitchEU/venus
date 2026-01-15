/**
 * useFormSessionSync Hook
 *
 * ROOT CAUSE FIX: Removed session object dependency to prevent render loops
 *
 * Single Responsibility - Sync form changes TO session (one direction only)
 * Restoration is handled by useSessionRestoration hook.
 * This hook ONLY syncs form changes to session store (debounced).
 *
 * Key Changes:
 * - No longer subscribes to session object (prevents re-renders)
 * - Reads session state internally via getState() when needed
 * - Only subscribes to formData changes
 *
 * @module hooks/useFormSessionSync
 */

import { useCallback, useEffect } from 'react'
import { backendAPI } from '../services/backendApi'
import { useSessionStore } from '../store/useSessionStore'
import { debounce } from '../utils/debounce'
import { generalLogger } from '../utils/logger'
import { NameGenerator } from '../utils/nameGenerator'

interface UseFormSessionSyncOptions {
  reportId: string | null | undefined
  formData: any
}

/**
 * Hook for synchronizing form data changes TO session store
 *
 * ROOT CAUSE FIX: Reads session state internally to prevent component re-renders
 * Only subscribes to formData changes, not session changes
 * Restoration (session → form) is handled by useSessionRestoration hook
 */
export const useFormSessionSync = ({ reportId, formData }: UseFormSessionSyncOptions) => {
  // Helper to check if form data matches session data (prevent unnecessary syncs)
  const isDataEqual = useCallback((formData: any, sessionData: any): boolean => {
    if (!sessionData || !formData) return false

    // Compare key fields that indicate meaningful changes
    const keyFields = [
      'company_name',
      'revenue',
      'ebitda',
      'industry',
      'business_model',
      'founding_year',
    ]

    for (const field of keyFields) {
      if (formData[field] !== sessionData[field]) {
        return false
      }
    }

    // Compare current_year_data
    if (
      formData.current_year_data?.revenue !== sessionData.current_year_data?.revenue ||
      formData.current_year_data?.ebitda !== sessionData.current_year_data?.ebitda
    ) {
      return false
    }

    return true
  }, [])

  // Debounced sync: form data → session store (500ms delay)
  // CRITICAL: Read session state inside the debounced function, not as a dependency
  // This prevents the component from re-rendering when session updates
  const debouncedSyncToSession = useCallback(
    debounce(async (data: typeof formData) => {
      // Read session state inside the debounced function (not subscribed)
      const currentSession = useSessionStore.getState().session
      const updateSessionData = useSessionStore.getState().updateSessionData

      if (!currentSession || !reportId || currentSession.reportId !== reportId) {
        return
      }

      if (!data || Object.keys(data).length === 0) {
        return
      }

      // Skip sync if data matches what's already in session (prevents loops during restoration)
      if (currentSession.sessionData && isDataEqual(data, currentSession.sessionData)) {
        generalLogger.debug('Skipping sync - form data matches session data', {
          reportId: currentSession.reportId,
        })
        return
      }

      try {
        // Convert ValuationFormData to Partial<ValuationRequest> for session
        // ✅ FIX: Include ALL form fields for complete persistence
        const sessionUpdate: Partial<any> = {
          company_name: data.company_name,
          country_code: data.country_code,
          industry: data.industry,
          subIndustry: data.subIndustry, // ✅ NEW: Include sub-industry field
          business_model: data.business_model,
          founding_year: data.founding_year,
          // ✅ NEW: Include business details fields
          business_description: data.business_description,
          business_highlights: data.business_highlights,
          reason_for_selling: data.reason_for_selling,
          city: data.city,
          current_year_data: {
            // ALWAYS use last full year, ignore session data to fix year 2026 bug
            year: new Date().getFullYear() - 1,
            revenue: data.revenue || data.current_year_data?.revenue || 0,
            ebitda: data.ebitda || data.current_year_data?.ebitda || 0,
            ...(data.current_year_data?.total_assets && {
              total_assets: data.current_year_data.total_assets,
            }),
            ...(data.current_year_data?.total_debt && {
              total_debt: data.current_year_data.total_debt,
            }),
            ...(data.current_year_data?.cash && { cash: data.current_year_data.cash }),
          },
          historical_years_data: data.historical_years_data,
          number_of_employees: data.number_of_employees,
          number_of_owners: data.number_of_owners,
          recurring_revenue_percentage: data.recurring_revenue_percentage,
          comparables: data.comparables,
          business_type_id: data.business_type_id,
          business_type: data.business_type,
          shares_for_sale: data.shares_for_sale,
          business_context: data.business_context,
        }

        // Remove undefined values
        Object.keys(sessionUpdate).forEach((key) => {
          if (sessionUpdate[key] === undefined) {
            delete sessionUpdate[key]
          }
        })

        // ✅ LOGGING: Verify historical data is synced
        if (sessionUpdate.historical_years_data) {
          generalLogger.debug('[useFormSessionSync] Syncing historical data', {
            reportId: currentSession.reportId,
            yearsCount: sessionUpdate.historical_years_data.length,
            years: sessionUpdate.historical_years_data.map((d: any) => d.year),
            yearsWithData: sessionUpdate.historical_years_data.map((d: any) => ({
              year: d.year,
              hasRevenue: !!(d.revenue && d.revenue > 0),
              hasEbitda: !!(d.ebitda && d.ebitda > 0),
            })),
          })
        }

        // ✅ FIX: Update local store first
        await updateSessionData(sessionUpdate)

        // ✅ NEW: Auto-update valuation name when company_name changes
        // This ensures name is updated immediately as user types
        if (
          sessionUpdate.company_name &&
          sessionUpdate.company_name.trim() &&
          currentSession.reportId
        ) {
          const newName = NameGenerator.generateFromCompany(sessionUpdate.company_name)
          const currentName = currentSession.name

          // Only update if name hasn't been manually edited (matches auto-generated pattern or is default)
          const shouldUpdateName =
            !currentName || // No name yet
            currentName === 'Valuation test123' || // Still using default
            currentName.includes('Valuation Report') || // Using default pattern
            currentName === newName || // Already matches
            (currentName.endsWith('business valuation') && newName !== currentName) // Ends with pattern but different company

          if (shouldUpdateName && newName !== currentName) {
            try {
              // Update session store optimistically
              useSessionStore.getState().updateSession({ name: newName })

              // Save to backend (fire-and-forget)
              backendAPI
                .updateValuationSession(currentSession.reportId, {
                  name: newName,
                } as any)
                .then((response) => {
                  if (response?.session?.name) {
                    useSessionStore.getState().updateSession({ name: response.session.name })
                    generalLogger.debug('[useFormSessionSync] Auto-updated valuation name', {
                      reportId: currentSession.reportId,
                      companyName: sessionUpdate.company_name,
                      newName: response.session.name,
                    })
                  }
                })
                .catch((error) => {
                  generalLogger.warn('[useFormSessionSync] Failed to auto-update valuation name', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    reportId: currentSession.reportId,
                    companyName: sessionUpdate.company_name,
                  })
                })
            } catch (error) {
              // Silently fail - name update is non-critical
              generalLogger.debug('[useFormSessionSync] Error updating valuation name', {
                error: error instanceof Error ? error.message : 'Unknown error',
              })
            }
          }
        }

        // ✅ NEW: Persist to backend after updating local store
        // This ensures form fields are saved even if user refreshes before submitting
        try {
          const { saveSession } = useSessionStore.getState()
          await saveSession('autosave') // ✅ FIX: Mark as autosave (debounced form sync)
          generalLogger.debug('Synced form data to session and persisted to backend', {
            reportId: currentSession.reportId,
            fieldsUpdated: Object.keys(sessionUpdate).length,
          })
        } catch (saveError) {
          // Log error but don't throw - local store is updated, backend save can retry
          generalLogger.warn('Failed to persist form data to backend (will retry on next change)', {
            reportId: currentSession.reportId,
            error: saveError instanceof Error ? saveError.message : String(saveError),
            note: 'Local store updated successfully, backend persistence will retry',
          })
        }
      } catch (err) {
        generalLogger.warn('Failed to sync form data to session', { error: err })
      }
    }, 500),
    [reportId, isDataEqual] // Only depend on reportId and isDataEqual, not session
  )

  // Sync form data to session store whenever it changes (debounced)
  // CRITICAL: Only subscribes to formData, not session
  useEffect(() => {
    if (formData && Object.keys(formData).length > 0 && reportId) {
      debouncedSyncToSession(formData)
    }
  }, [formData, debouncedSyncToSession, reportId])
}
