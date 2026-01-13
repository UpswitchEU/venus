/**
 * useSessionRestoration Hook
 *
 * Single Responsibility: Automatically restore form data, results, and versions from session
 * Uses Zustand stores for simple and robust state management
 *
 * This hook watches the session store and automatically:
 * 1. Restores form data to form store when session loads
 * 2. Restores valuation results to results store when session loads
 * 3. Fetches version history when session loads
 * 4. Handles report changes smoothly
 *
 * Restoration Order: session -> form -> results -> versions
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
 * NOTE: This hook is deprecated. Use flow-specific restoration in layouts instead.
 * Kept for backwards compatibility but should be removed in future.
 */
export function useSessionRestoration() {
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
    // Convert session data to form data format - COMPLETE FIELD MAPPING
    const sessionDataAny = sessionData as any
    const formDataUpdate: Partial<any> = {
      // Basic company information
      company_name: sessionData.company_name,
      country_code: sessionData.country_code,
      industry: sessionData.industry,
      business_model: sessionData.business_model,
      founding_year: sessionData.founding_year,

      // Business details
      business_type: sessionData.business_type,
      business_type_id: sessionData.business_type_id,
      business_structure: sessionDataAny.business_structure || sessionData.business_type,
      business_description: sessionData.business_description,
      business_highlights: sessionData.business_highlights,
      reason_for_selling: sessionData.reason_for_selling,

      // Location
      city: sessionData.city,

      // Financials (handle both nested and flat structures)
      revenue: sessionData.current_year_data?.revenue || sessionDataAny.revenue,
      ebitda: sessionData.current_year_data?.ebitda || sessionDataAny.ebitda,
      current_year_data: sessionData.current_year_data,
      historical_years_data: sessionData.historical_years_data,
      recurring_revenue_percentage: sessionData.recurring_revenue_percentage,

      // Ownership
      number_of_employees: sessionData.number_of_employees,
      number_of_owners: sessionData.number_of_owners,
      shares_for_sale: sessionData.shares_for_sale,

      // Owner profiling
      owner_role: sessionDataAny.owner_role,
      owner_hours: sessionDataAny.owner_hours,
      delegation_capability: sessionDataAny.delegation_capability,
      succession_plan: sessionDataAny.succession_plan,
      provide_historical_data: sessionDataAny.provide_historical_data,

      // Other
      comparables: sessionData.comparables,
      business_context: sessionData.business_context,
    }

    // Remove undefined values
    Object.keys(formDataUpdate).forEach((key) => {
      if (formDataUpdate[key] === undefined) {
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
