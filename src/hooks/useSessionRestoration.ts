/**
 * useSessionRestoration Hook
 *
 * @deprecated This hook is DEPRECATED and will be removed in a future version.
 * 
 * Session restoration is now handled centrally by SessionRestorationService,
 * which is automatically invoked when useSessionStore.loadSession() is called.
 * 
 * The centralized restoration service provides:
 * - Atomic hydration of ALL stores (form, results, versions, EBITDA normalizations)
 * - Idempotent restoration (safe to call multiple times)
 * - No race conditions (single source of truth)
 * - Complete asset restoration for existing sessions
 * 
 * Migration: Remove usage of this hook. The session store will automatically
 * restore all data when the session is loaded.
 * 
 * @see SessionRestorationService - The centralized replacement
 * @see useSessionStore.loadSession - Entry point for session loading
 * 
 * @module hooks/useSessionRestoration
 */

import { useEffect, useRef } from 'react'
import { useManualFormStore, useManualResultsStore } from '../store/manual'
import { useEbitdaNormalizationStore } from '../store/useEbitdaNormalizationStore'
import { useSessionStore } from '../store/useSessionStore'
import { useVersionHistoryStore } from '../store/useVersionHistoryStore'
import { generalLogger } from '../utils/logger'
import { hasMeaningfulSessionData } from '../utils/sessionDataUtils'
import { useRestorationProgress } from './useRestorationProgress'
import { useToast } from './useToast'

/**
 * Hook to automatically restore form data, results, and versions from session
 *
 * This ensures smooth repopulation when:
 * - Page reloads
 * - User revisits a report
 * - Session data loads from backend
 *
 * Uses Zustand stores for simple, robust state management
 *
 * NOTE: Only restores for EXISTING reports (with meaningful sessionData).
 * NEW reports (empty sessionData) skip restoration entirely.
 *
 * SIMPLIFIED: Single restoration per reportId - no complex flag management.
 */
/**
 * @deprecated See module-level deprecation notice above.
 */
export function useSessionRestoration() {
  // DEPRECATION WARNING: Log warning on first use
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[DEPRECATED] useSessionRestoration is deprecated. ' +
      'Session restoration is now handled centrally by SessionRestorationService. ' +
      'Remove this hook usage - restoration happens automatically via useSessionStore.loadSession().'
    )
  }
  
  // ROOT CAUSE FIX: Only subscribe to reportId, not entire session object
  const reportId = useSessionStore((state) => state.session?.reportId)
  const { updateFormData } = useManualFormStore()
  const { setResult, setHtmlReport, setInfoTabHtml } = useManualResultsStore()
  const { fetchVersions } = useVersionHistoryStore()
  const { loadAllNormalizations } = useEbitdaNormalizationStore()
  const { showToast } = useToast()

  // Restoration progress tracking
  const { progress, updateProgress, reset } = useRestorationProgress({
    reportId: reportId ?? null, // Convert undefined to null
    onProgressChange: (progress) => {
      // Store progress in session store for UI to display
      useSessionStore.setState({ restorationProgress: progress })
    },
  })

  // Track restored reports using a Set (simple and efficient)
  const restoredReports = useRef<Set<string>>(new Set())
  const lastReportIdRef = useRef<string | null>(null)

  // Single restoration effect - only runs when reportId changes (new session loaded)
  useEffect(() => {
    // ROOT CAUSE FIX: Read session state inside effect, not as subscription
    if (!reportId) {
      return
    }

    // Only restore once per reportId (when new session loads)
    if (restoredReports.current.has(reportId)) {
      return
    }

    // Check if reportId changed (new session loaded)
    if (lastReportIdRef.current === reportId) {
      return
    }

    // Update tracked reportId
    lastReportIdRef.current = reportId

    // Read session state inside effect
    const currentSession = useSessionStore.getState().session
    if (!currentSession || currentSession.reportId !== reportId) {
      return
    }

    // CRITICAL: Use session.sessionData directly (merged with top-level fields)
    // NOT getSessionData() which filters to form fields only
    // We need access to html_report, info_tab_html, valuation_result for restoration
    const sessionData = currentSession.sessionData as any

    // CRITICAL: Skip restoration for NEW reports (empty sessionData)
    if (!sessionData || !hasMeaningfulSessionData(sessionData, currentSession)) {
      generalLogger.debug('Skipping restoration - NEW report (empty sessionData)', {
        reportId,
      })
      // ✅ CRITICAL FIX: Mark initialization as complete even when skipping restoration
      // This prevents infinite loading state for new reports
      useSessionStore.getState().completeInitialization()
      generalLogger.debug('[SessionRestoration] Initialization marked as complete (skipped restoration)', { reportId })
      // Mark as restored to prevent re-checking
      restoredReports.current.add(reportId)
      return
    }

    // Mark as restoring immediately to prevent duplicates
    restoredReports.current.add(reportId)

    // Start restoration progress
    updateProgress('restoring', 'Loading session')

    generalLogger.info('Starting session restoration', {
      reportId,
      hasSessionData: !!sessionData,
      sessionDataKeys: Object.keys(sessionData || {}),
      // CRITICAL: Log what we're about to restore
      hasHtmlReport: !!sessionData?.html_report,
      htmlReportLength: sessionData?.html_report?.length || 0,
      hasInfoTabHtml: !!sessionData?.info_tab_html,
      infoTabHtmlLength: sessionData?.info_tab_html?.length || 0,
      hasValuationResult: !!sessionData?.valuation_result,
      valuationResultKeys: Object.keys(sessionData?.valuation_result || {}),
      // Also check fallback top-level fields
      hasTopLevelHtmlReport: !!currentSession?.htmlReport,
      hasTopLevelInfoTabHtml: !!currentSession?.infoTabHtml,
      hasTopLevelValuationResult: !!currentSession?.valuationResult,
    })

    // Async restoration with progress tracking
    const restoreAsync = async () => {
      try {
        // STEP 1: Restore form data
        updateProgress('restoring', 'Restoring form data')
        restoreFormData(reportId, sessionData, updateFormData)

        // STEP 2: Restore valuation results
        updateProgress('restoring', 'Restoring valuation results')
        restoreResults(
          reportId,
          sessionData,
          currentSession,
          setResult,
          setHtmlReport,
          setInfoTabHtml
        )

        // STEP 3: Fetch version history (async, non-blocking)
        updateProgress('restoring', 'Loading version history')
        try {
          await fetchVersions(reportId)
          generalLogger.info('Version history fetched', {
            reportId,
          })
        } catch (error) {
          generalLogger.warn('Failed to fetch versions (non-blocking)', {
            error: error instanceof Error ? error.message : String(error),
            reportId,
          })
          // Continue - versions are optional
        }

        // STEP 4: Load EBITDA normalizations (async, non-blocking)
        updateProgress('restoring', 'Restoring normalization data')
        try {
          await loadAllNormalizations(reportId)
          const normalizations = useEbitdaNormalizationStore.getState().normalizations
          const count = Object.keys(normalizations).length
          generalLogger.info('EBITDA normalizations loaded', {
            reportId,
            count,
            years: Object.keys(normalizations),
          })
        } catch (error) {
          generalLogger.warn('Failed to load normalizations (non-blocking)', {
            error: error instanceof Error ? error.message : String(error),
            reportId,
          })
          // Continue - normalizations are optional
        }

        // Mark restoration as complete
        updateProgress('completed')

        generalLogger.info('Session restoration completed successfully', {
          reportId,
          restoredFormData: true,
          restoredValuationResult: !!sessionData?.valuation_result,
          restoredHtmlReport: !!sessionData?.html_report,
          restoredInfoTabHtml: !!sessionData?.info_tab_html,
        })

        // ✅ FIX: Only show toast if we actually restored meaningful data (not a new empty report)
        // Check for actual user-entered data or valuation results
        const hasRestoredData =
          sessionData &&
          typeof sessionData === 'object' &&
          Object.keys(sessionData).length > 0 &&
          (sessionData.company_name ||
            sessionData.revenue ||
            sessionData.ebitda ||
            sessionData.current_year_data?.revenue ||
            sessionData.current_year_data?.ebitda ||
            sessionData.valuation_result ||
            sessionData.html_report ||
            sessionData.info_tab_html)

        // ✅ CRITICAL FIX: Mark initialization as complete after restoration
        // This allows the loading state to transition to data-entry
        useSessionStore.getState().completeInitialization()
        generalLogger.debug('[SessionRestoration] Initialization marked as complete', { reportId })

        // ✅ FIX: Check if we're in initialization phase (prevents toasts during initial load)
        const isInitializing = useSessionStore.getState().isInitializing

        if (hasRestoredData && !isInitializing) {
          // Only show toast if there's actual data AND we're not in initialization phase
          showToast('Report loaded successfully', 'success', 3000)
        } else {
          generalLogger.debug('Skipping load toast', {
            reportId,
            reason: isInitializing ? 'initializing' : 'no meaningful data',
            hasRestoredData,
            isInitializing,
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        generalLogger.error('Session restoration failed', {
          error: errorMessage,
          reportId,
        })

        // ✅ FIX: Still mark initialization as complete even on error
        // This prevents infinite loading state
        useSessionStore.getState().completeInitialization()
        generalLogger.debug('[SessionRestoration] Initialization marked as complete (after error)', { reportId })

        // Update progress with error
        updateProgress('error', undefined, errorMessage)

        // Remove from restored set to allow retry on next mount
        restoredReports.current.delete(reportId)
        lastReportIdRef.current = null // Reset to allow retry

        // Show error toast
        showToast('Failed to load report data. Please refresh the page.', 'error', 5000)
      }
    }

    // Execute restoration
    restoreAsync()
  }, [
    reportId,
    updateFormData,
    setResult,
    setHtmlReport,
    setInfoTabHtml,
    fetchVersions,
    loadAllNormalizations,
    showToast,
    updateProgress,
  ])

  // Cleanup: Allow re-restoration if component remounts
  useEffect(() => {
    return () => {
      if (reportId) {
        restoredReports.current.delete(reportId)
        lastReportIdRef.current = null
        generalLogger.debug('Cleared restoration tracking on unmount', {
          reportId,
        })
      }
    }
  }, [reportId])
}

/**
 * Helper: Restore form data from session to form store
 */
function restoreFormData(
  reportId: string,
  sessionData: any,
  updateFormData: (data: Partial<any>) => void
) {
  try {
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
    
    // Convert session data to form data format - COMPLETE FIELD MAPPING
    const sessionDataAny = mergedData as any
    const formDataUpdate: Partial<any> = {
      // Basic company information
      company_name: mergedData.company_name,
      country_code: mergedData.country_code || mergedData.country,
      industry: mergedData.industry,
      business_model: mergedData.business_model,
      founding_year: mergedData.founding_year || mergedData.founded_year,

      // Business details
      business_type: mergedData.business_type,
      business_type_id: mergedData.business_type_id,
      business_structure: sessionDataAny.business_structure || mergedData.business_type,
      business_description: mergedData.business_description,
      business_highlights: mergedData.business_highlights,
      reason_for_selling: mergedData.reason_for_selling,

      // Location
      city: mergedData.city,
      postal_code: mergedData.postal_code,

      // Financials (handle both nested and flat structures)
      revenue: mergedData.current_year_data?.revenue || sessionDataAny.revenue,
      ebitda: mergedData.current_year_data?.ebitda || sessionDataAny.ebitda,
      current_year_data: mergedData.current_year_data,
      historical_years_data: mergedData.historical_years_data,
      recurring_revenue_percentage: mergedData.recurring_revenue_percentage,

      // Ownership
      number_of_employees: mergedData.number_of_employees || mergedData.employee_count,
      number_of_owners: mergedData.number_of_owners,
      shares_for_sale: mergedData.shares_for_sale,

      // KBO registry fields
      kbo_number: mergedData.kbo_number,
      vat_number: mergedData.vat_number,
      legal_form: mergedData.legal_form,
      nace_code: mergedData.nace_code,
      nace_description: mergedData.nace_description,

      // Owner profiling
      owner_role: sessionDataAny.owner_role,
      owner_hours: sessionDataAny.owner_hours,
      delegation_capability: sessionDataAny.delegation_capability,
      succession_plan: sessionDataAny.succession_plan,
      provide_historical_data: sessionDataAny.provide_historical_data,

      // Other
      comparables: mergedData.comparables,
      business_context: mergedData.business_context,
    }

    // ✅ FIX: Remove undefined values but preserve empty strings and null for business card fields
    // Empty strings are valid values (e.g., user cleared a field)
    // Only remove truly undefined values
    // CRITICAL: Preserve business card fields (company_name, business_type_id, founding_year, country_code)
    // even if they're empty strings, as they indicate business card data from Mercury
    Object.keys(formDataUpdate).forEach((key) => {
      // Business card fields should be preserved even if empty string
      const businessCardFields = ['company_name', 'business_type_id', 'founding_year', 'country_code', 'industry', 'city']
      if (businessCardFields.includes(key)) {
        // Only remove if truly undefined (not empty string or null)
        if (formDataUpdate[key] === undefined) {
          delete formDataUpdate[key]
        }
      } else if (formDataUpdate[key] === undefined) {
        delete formDataUpdate[key]
      }
    })

    if (Object.keys(formDataUpdate).length > 0) {
      updateFormData(formDataUpdate)
      generalLogger.info('Form data restored from session', {
        reportId,
        fieldsRestored: Object.keys(formDataUpdate).length,
        companyName: formDataUpdate.company_name,
        hasRevenue: !!formDataUpdate.revenue,
      })
    }
  } catch (error) {
    generalLogger.error('Form data restoration failed', {
      error: error instanceof Error ? error.message : String(error),
      reportId,
    })
  }
}

/**
 * Helper: Restore valuation results from session to results store
 * Checks both merged sessionData AND top-level session fields for backward compatibility
 */
function restoreResults(
  reportId: string,
  sessionData: any,
  session: any,
  setResult: (result: any) => void,
  setHtmlReport: (html: string) => void,
  setInfoTabHtml: (html: string) => void
) {
  try {
    // Check merged sessionData first, then top-level session fields as fallback
    const valuationResult = sessionData?.valuation_result || session?.valuationResult
    const htmlReport = sessionData?.html_report || session?.htmlReport
    const infoTabHtml = sessionData?.info_tab_html || session?.infoTabHtml

    // Restore complete result object (not just HTML)
    if (valuationResult) {
      const fullResult = {
        ...valuationResult,
        // Merge HTML reports if not in result object
        html_report: valuationResult.html_report || htmlReport,
        info_tab_html: valuationResult.info_tab_html || infoTabHtml,
      }
      setResult(fullResult)
      generalLogger.info('Valuation result restored from session', {
        reportId,
        valuationId: fullResult.valuation_id,
        hasHtmlReport: !!fullResult.html_report,
        htmlLength: fullResult.html_report?.length || 0,
        hasInfoTabHtml: !!fullResult.info_tab_html,
        infoLength: fullResult.info_tab_html?.length || 0,
      })
    } else if (htmlReport || infoTabHtml) {
      // Partial restoration - HTML exists but no result object
      if (htmlReport) {
        setHtmlReport(htmlReport)
        generalLogger.info('HTML report restored from session (partial)', {
          reportId,
          htmlLength: htmlReport.length,
        })
      }
      if (infoTabHtml) {
        setInfoTabHtml(infoTabHtml)
        generalLogger.info('Info tab HTML restored from session (partial)', {
          reportId,
          infoLength: infoTabHtml.length,
        })
      }
    }
  } catch (error) {
    generalLogger.error('Results restoration failed', {
      error: error instanceof Error ? error.message : String(error),
      reportId,
    })
  }
}
