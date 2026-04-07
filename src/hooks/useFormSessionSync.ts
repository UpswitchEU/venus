/**
 * useFormSessionSync Hook
 *
 * ROOT CAUSE FIX: Removed session object dependency to prevent render loops
 *
 * Single Responsibility - Sync form changes TO session (one direction only)
 * Restoration is handled centrally by SessionRestorationService.
 * This hook ONLY syncs form changes to session store (debounced).
 *
 * Key Changes:
 * - No longer subscribes to session object (prevents re-renders)
 * - Reads session state internally via getState() when needed
 * - Only subscribes to formData changes
 *
 * @see SessionRestorationService - Centralized restoration service
 * @see useSessionStore.loadSession - Entry point for session loading with restoration
 *
 * @module hooks/useFormSessionSync
 */

import { useCallback, useEffect } from 'react'
import { useSessionStore } from '../store/useSessionStore'
import { debounceWithFlush } from '../utils/debounce'
import { normalizeCurrentYearForFiling, normalizeHistoricalYearsForFiling } from '../utils/fiscalYear'
import { generalLogger } from '../utils/logger'
import { NameGenerator } from '../utils/nameGenerator'
import { buildCurrentYearData, OPTIONAL_YEAR_DATA_FIELDS } from '../utils/yearData'

interface UseFormSessionSyncOptions {
  reportId: string | null | undefined
  formData: any
}

/**
 * Hook for synchronizing form data changes TO session store
 *
 * ROOT CAUSE FIX: Reads session state internally to prevent component re-renders
 * Only subscribes to formData changes, not session changes
 * Restoration (session → form) is handled centrally by SessionRestorationService
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
      'business_type_id',
      'rev_recurring_amount',
      'rev_top_client_amount',
      'rev_gross_churn_pct',
    ]

    for (const field of keyFields) {
      if (formData[field] !== sessionData[field]) {
        return false
      }
    }

    if (formData.filing_year_confirmed !== sessionData.filing_year_confirmed) {
      return false
    }

    // Compare current_year_data
    const formCurrentYear = formData.current_year_data
    const sessionCurrentYear = sessionData.current_year_data
    if (!!formCurrentYear !== !!sessionCurrentYear) {
      return false
    }
    if (formCurrentYear || sessionCurrentYear) {
      const fieldsToCompare = ['year', 'revenue', 'ebitda', ...OPTIONAL_YEAR_DATA_FIELDS]
      for (const field of fieldsToCompare) {
        if (formCurrentYear?.[field] !== sessionCurrentYear?.[field]) {
          return false
        }
      }
    }

    // Compare historical_years_data (prevents skipping sync when only historical data changed)
    const formHist = formData.historical_years_data
    const sessHist = sessionData.historical_years_data
    if (!Array.isArray(formHist) && !Array.isArray(sessHist)) return true
    if (!Array.isArray(formHist) || !Array.isArray(sessHist)) return false
    if (formHist.length !== sessHist.length) return false
    const formStr = JSON.stringify(
      formHist.map((y: any) => ({ year: y.year, revenue: y.revenue, ebitda: y.ebitda })).sort((a: any, b: any) => a.year - b.year)
    )
    const sessStr = JSON.stringify(
      sessHist.map((y: any) => ({ year: y.year, revenue: y.revenue, ebitda: y.ebitda })).sort((a: any, b: any) => a.year - b.year)
    )
    if (formStr !== sessStr) return false

    // Treat missing vs [] as equivalent — both mean "no persisted forecast rows".
    const formFc = Array.isArray(formData.forecast_years_data)
      ? formData.forecast_years_data
      : []
    const sessFc = Array.isArray(sessionData.forecast_years_data)
      ? sessionData.forecast_years_data
      : []
    if (formFc.length !== sessFc.length) return false
    const fcFormStr = JSON.stringify(
      formFc.map((y: any) => ({ year: y.year, revenue: y.revenue, ebitda: y.ebitda })).sort((a: any, b: any) => a.year - b.year)
    )
    const fcSessStr = JSON.stringify(
      sessFc.map((y: any) => ({ year: y.year, revenue: y.revenue, ebitda: y.ebitda })).sort((a: any, b: any) => a.year - b.year)
    )
    if (fcFormStr !== fcSessStr) return false

    return true
  }, [])

  // Debounced sync: form data → session store (500ms delay)
  // CRITICAL: Read session state inside the debounced function, not as a dependency
  // This prevents the component from re-rendering when session updates
  // Uses debounceWithFlush for page unload - flush() saves pending changes before tab close
  const debouncedSyncToSession = useCallback(
    debounceWithFlush(async (data: typeof formData) => {
      // Guard: don't sync while restoration is in progress to avoid overwriting restored data
      if (!useSessionStore.getState().restorationComplete) {
        return
      }

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
        const normalizedCurrentYear = normalizeCurrentYearForFiling(
          data.current_year_data?.year ?? data.year,
          Boolean(data.filing_year_confirmed)
        )
        const normalizedHistoricalYears = normalizeHistoricalYearsForFiling(
          data.historical_years_data,
          Boolean(data.filing_year_confirmed)
        )

        const sessionUpdate: Partial<any> = {
          company_name: data.company_name,
          country_code: data.country_code,
          industry: data.industry,
          subIndustry: data.subIndustry,
          business_model: data.business_model,
          founding_year: data.founding_year,
          business_description: data.business_description,
          business_highlights: data.business_highlights,
          reason_for_selling: data.reason_for_selling,
          city: data.city,
          revenue: data.revenue,
          ebitda: data.ebitda,
          filing_year_confirmed: data.filing_year_confirmed,
          current_year_data: buildCurrentYearData({
            // Respect the explicitly selected base year when the accountant confirms a newer filing year.
            year: normalizedCurrentYear,
            revenue: data.revenue ?? data.current_year_data?.revenue ?? 0,
            ebitda: data.ebitda ?? data.current_year_data?.ebitda ?? 0,
            currentYearData: data.current_year_data,
          }),
          historical_years_data: normalizedHistoricalYears,
          ...(data.forecast_years_data !== undefined && {
            forecast_years_data: data.forecast_years_data,
          }),
          number_of_employees: data.number_of_employees,
          number_of_owners: data.number_of_owners,
          recurring_revenue_percentage: data.recurring_revenue_percentage,
          comparables: data.comparables,
          business_type_id: data.business_type_id,
          business_type: data.business_type,
          shares_for_sale: 100,
          business_context: data.business_context,
          rev_recurring_amount: data.rev_recurring_amount,
          rev_top_client_amount: data.rev_top_client_amount,
          rev_gross_churn_pct: data.rev_gross_churn_pct,
          kbo_number: data.kbo_number,
          vat_number: data.vat_number,
          postal_code: data.postal_code,
          legal_form: data.legal_form,
          nace_code: data.nace_code,
          nace_description: data.nace_description,
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
            currentName === '__new_valuation__' || // Still using default
            currentName.includes('Valuation Report') || // Using default pattern
            currentName === newName || // Already matches
            (currentName.endsWith('business valuation') && newName !== currentName) // Ends with pattern but different company

          if (shouldUpdateName && newName !== currentName) {
            try {
              // Persist name through the centralized session autosave path.
              useSessionStore.getState().updateSession({ name: newName })
              generalLogger.debug('[useFormSessionSync] Queued auto-generated valuation name', {
                reportId: currentSession.reportId,
                companyName: sessionUpdate.company_name,
                newName,
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

  // Flush pending debounced sync on page unload and tab hide to prevent data loss.
  // NOTE: We do NOT flush in cleanup — that can race with unmount and cause async work after
  // unmount (React Strict Mode, fast navigation). beforeunload/pagehide/visibilitychange suffice.
  useEffect(() => {
    const flush = () => debouncedSyncToSession.flush?.()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [debouncedSyncToSession])
}
