/**
 * ManualLayout Component
 *
 * Main layout component for manual valuation flow.
 * Single Responsibility: Layout orchestration and UI state management.
 *
 * @module features/manual/components/ManualLayout
 */

import React, { Suspense, useEffect, useRef } from 'react'
import { AssetInspector } from '../../../components/debug/AssetInspector'
import { FullScreenModal } from '../../../components/FullScreenModal'
import { LoadingState } from '../../../components/LoadingState'
import { INITIALIZATION_STEPS } from '../../../components/LoadingState.constants'
import { ResizableDivider } from '../../../components/ResizableDivider'
import { InputFieldsSkeleton } from '../../../components/skeletons'
import { ValuationForm } from '../../../components/ValuationForm'
import { ValuationToolbar } from '../../../components/ValuationToolbar'
import { shouldEnableSessionRestoration } from '../../../config/features'
import { useAuth } from '../../../hooks/useAuth'
import { useBootstrapSync } from '../../../hooks/useBootstrapSync'
import { useToast } from '../../../hooks/useToast'
import {
  useValuationToolbarFullscreen,
  useValuationToolbarTabs,
  type ValuationTab,
} from '../../../hooks/valuationToolbar'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { ReportPanel } from '../../conversational/components/ReportPanel'
import { useManualPanelResize, useManualToolbar } from '../hooks'
import { MobilePanelSwitcher } from './MobilePanelSwitcher'

/**
 * Manual Layout Component Props
 */
interface ManualLayoutProps {
  /** Unique report identifier */
  reportId: string
  /** Callback when manual valuation completes */
  onComplete: (result: ValuationResponse) => void
  /** Initial version to load (M&A workflow) */
  initialVersion?: number
  /** Initial mode (edit/view) */
  initialMode?: 'edit' | 'view'
}

/**
 * Manual Layout Component
 *
 * Provides 2-panel layout:
 * - Left: Form inputs for manual data entry
 * - Right: Report preview (Preview/Info tabs)
 */
export const ManualLayout: React.FC<ManualLayoutProps> = ({
  reportId,
  onComplete,
  initialVersion,
  initialMode = 'edit',
}) => {
  // EMERGENCY: Render loop detector to prevent tab freeze
  const renderCountRef = useRef(0)
  const renderTimestampRef = useRef(Date.now())

  renderCountRef.current += 1
  const now = Date.now()

  // Reset counter every 5 seconds
  if (now - renderTimestampRef.current > 5000) {
    renderCountRef.current = 1
    renderTimestampRef.current = now
  }

  // Log excessive renders (synchronous warning is fine)
  if (renderCountRef.current > 50) {
    generalLogger.warn('[ManualLayout] High render count detected', {
      reportId,
      renderCount: renderCountRef.current,
    })
  }

  // Check for render loop asynchronously to avoid inconsistent state during render
  useEffect(() => {
    if (renderCountRef.current > 100) {
      const timeWindow = performance.now() - renderTimestampRef.current
      generalLogger.error('[ManualLayout] RENDER LOOP DETECTED - Throwing error to break loop', {
        reportId,
        renderCount: renderCountRef.current,
        timeWindow,
      })
      // Throw asynchronously via setTimeout to ensure error boundary catches it properly
      setTimeout(() => {
        throw new Error(
          `Render loop detected in ManualLayout (${renderCountRef.current} renders in ${timeWindow.toFixed(0)}ms). Please contact support.`
        )
      }, 0)
    }
  })

  const { user } = useAuth()
  
  // WORLD CLASS: Sync bootstrap state with stores for unified initialization
  useBootstrapSync()
  
  const { isCalculating, error, result, setResult } = useManualResultsStore()
  // CRITICAL FIX: Don't subscribe to formData or updateFormData - they cause re-renders on every form change
  // We only need updateFormData inside the restoration effect, accessed via getState()
  const { showToast } = useToast()

  // ✅ CRITICAL: Loading guards - prevent rendering until session is ready
  const isLoading = useSessionStore((state) => state.isLoading)
  const isInitializing = useSessionStore((state) => state.isInitializing)
  const session = useSessionStore((state) => state.session)
  const sessionError = useSessionStore((state) => state.error)

  // ✅ FIX: Show loading state until session is loaded and initialized
  // This prevents the glitch where forms show before data is ready
  if (isLoading || isInitializing || !session || session.reportId !== reportId) {
    // BANK GRADE: White background with sage green loader
    return <LoadingState steps={INITIALIZATION_STEPS} variant="light" />
  }

  // ✅ FIX: Show error state if session failed to load
  if (sessionError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-rust-500/20 border border-rust-500/30 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-rust-400 mb-2">Session Error</h3>
            <p className="text-rust-300 mb-6">{sessionError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ✅ NEW: Track unsaved changes to determine if toast should show
  const hasUnsavedChanges = useSessionStore((state) => state.hasUnsavedChanges)
  // ✅ FIX: Use a ref to track the last known unsaved changes state
  // This is updated reactively, and the callback reads it when invoked
  const lastUnsavedChangesRef = useRef<boolean>(false)

  // ✅ NEW: Update ref when hasUnsavedChanges changes
  // This ensures we always have the latest state when the callback is invoked
  useEffect(() => {
    lastUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  // ✅ NEW: Set up save success callback to show toast only when actual saves happen
  useEffect(() => {
    // Set up callback that will be called when saveSession completes (for 'user' saves only)
    useSessionStore.setState({
      onSaveSuccess: () => {
        // ✅ FIX: Check if we're still initializing (prevents toasts during auto-fill/setup)
        const isInitializing = useSessionStore.getState().isInitializing
        if (isInitializing) {
          // Skip toast during initialization phase (auto-fill, restoration, etc.)
          return
        }

        // ✅ FIX: Read ref value when callback is invoked
        // Since we update the ref reactively, this captures the state from before save started
        // (The saveSession function sets hasUnsavedChanges to false AFTER save completes,
        // so the ref will still have the "before save" value when callback is invoked)
        if (lastUnsavedChangesRef.current) {
          showToast('Valuation saved successfully', 'success', 3000)
        }
      },
      // ✅ NEW: Set up asset save success callback (when valuation assets are saved after CTA click)
      onAssetSaveSuccess: () => {
        // ✅ FIX: Check if we're still initializing (prevents toasts during auto-fill/setup)
        const isInitializing = useSessionStore.getState().isInitializing
        if (isInitializing) {
          return
        }
        // Show toast when valuation assets are saved (after calculation completes)
        showToast('Valuation saved successfully', 'success', 3000)
      },
    })

    return () => {
      // Clean up callbacks on unmount
      useSessionStore.setState({
        onSaveSuccess: undefined,
        onAssetSaveSuccess: undefined,
      })
    }
  }, [showToast])

  // Track restoration to prevent loops
  const restorationRef = useRef<{
    lastRestoredReportId: string | null
    isRestoring: boolean
    lastAttemptedReportId: string | null // Track if we attempted but session wasn't ready
  }>({
    lastRestoredReportId: null,
    isRestoring: false,
    lastAttemptedReportId: null,
  })

  // Simple restoration: Only restore on reportId change (new session loaded)
  // CRITICAL: This effect MUST only run when reportId prop changes, NOT on every render
  // We read session state inside the effect without subscribing to avoid re-renders
  useEffect(() => {
    // Only restore once per reportId (when new report loads)
    if (restorationRef.current.lastRestoredReportId === reportId) {
      return
    }

    // Prevent concurrent restoration
    if (restorationRef.current.isRestoring) {
      return
    }

    // Read session state inside effect (only when reportId changes)
    const currentSession = useSessionStore.getState().session
    if (!currentSession || currentSession.reportId !== reportId) {
      // ✅ FIX: Track that we attempted restoration but session wasn't ready
      // This allows us to retry when session becomes available
      if (reportId && restorationRef.current.lastAttemptedReportId !== reportId) {
        restorationRef.current.lastAttemptedReportId = reportId
        generalLogger.debug('[ManualLayout] Session not ready yet, will retry when available', {
          reportId,
          hasSession: !!currentSession,
          sessionReportId: currentSession?.reportId,
        })
      }
      return
    }

    // Clear attempted flag since session is now available
    restorationRef.current.lastAttemptedReportId = null

    // Check feature flag before restoring
    if (!shouldEnableSessionRestoration()) {
      generalLogger.info('[ManualLayout] Session restoration disabled by feature flag', {
        reportId,
      })
      restorationRef.current.lastRestoredReportId = reportId
      return
    }

    // Mark as restoring
    restorationRef.current.isRestoring = true

    try {
      const { updateFormData: updateFormDataFn } = useManualFormStore.getState()
      const { setResult: setResultFn } = useManualResultsStore.getState()
      const currentFormData = useManualFormStore.getState().formData

      // ✅ FIX: Declare variables outside if block so they're accessible later
      let hasSessionData = false
      let formIsEmpty = true

      // CRITICAL: Only restore if form is truly empty (no user input yet)
      // This prevents overwriting user input during active editing
      // Be very strict - only restore if form has NO meaningful data
      if (currentSession.sessionData) {
        const sessionDataObj = currentSession.sessionData as any

        // ✅ FIX: Enhanced logging to debug form restoration
        generalLogger.info('[ManualLayout] Checking form restoration', {
          reportId,
          hasSessionData: !!currentSession.sessionData,
          sessionDataKeys: sessionDataObj ? Object.keys(sessionDataObj) : [],
          sessionDataSample: {
            companyName: sessionDataObj?.company_name,
            companyNameType: typeof sessionDataObj?.company_name,
            companyNameLength: sessionDataObj?.company_name?.length || 0,
            companyNameIsEmptyString: sessionDataObj?.company_name === '',
            companyNameIsUndefined: sessionDataObj?.company_name === undefined,
            revenue: sessionDataObj?.revenue,
            ebitda: sessionDataObj?.ebitda,
            industry: sessionDataObj?.industry,
            businessDescription: sessionDataObj?.business_description,
            businessHighlights: sessionDataObj?.business_highlights,
            reasonForSelling: sessionDataObj?.reason_for_selling,
            city: sessionDataObj?.city,
            hasHistoricalData: !!(
              sessionDataObj?.historical_years_data &&
              Array.isArray(sessionDataObj.historical_years_data) &&
              sessionDataObj.historical_years_data.length > 0
            ),
            historicalDataCount: sessionDataObj?.historical_years_data?.length || 0,
            currentYearData: sessionDataObj?.current_year_data,
          },
          currentFormSample: {
            companyName: currentFormData.company_name,
            companyNameType: typeof currentFormData.company_name,
            companyNameLength: currentFormData.company_name?.length || 0,
            revenue: currentFormData.revenue,
            ebitda: currentFormData.ebitda,
            industry: currentFormData.industry,
          },
        })

        // ✅ ACCOUNTANT WORKFLOW FIX: Check if this is an accountant-created session
        // These sessions ALWAYS have business card data that should be restored
        const isAccountantSession = !!(sessionDataObj._client_context || sessionDataObj._accountant_customer_id)
        const hasBusinessCardData = !!(
          sessionDataObj.company_name !== undefined ||
          sessionDataObj.business_type_id ||
          sessionDataObj.founding_year ||
          sessionDataObj.country_code
        )
        const hasFinancialData =
          !!sessionDataObj.revenue ||
          !!sessionDataObj.ebitda ||
          !!sessionDataObj.current_year_data?.revenue ||
          !!sessionDataObj.current_year_data?.ebitda

        generalLogger.info('[ManualLayout] Session context check', {
          reportId,
          isAccountantSession,
          hasBusinessCardData,
          hasFinancialData,
          hasClientContext: !!sessionDataObj._client_context,
          clientContext: sessionDataObj._client_context,
          hasAccountantCustomerId: !!sessionDataObj._accountant_customer_id,
        })

        // Check if form is empty - be more strict to avoid overwriting user input
        // ✅ FIX: Only check critical user-entered fields (ignore defaults like industry='services')
        // Default values don't indicate user has filled the form
        // Also check current_year_data for revenue/ebitda (form might have defaults there)
        // ✅ FIX: Don't consider form "filled" if it only has default values (country_code='BE', founding_year=currentYear-5)
        // These are just form defaults, not user-entered data
        const hasRevenue =
          currentFormData.revenue ||
          (currentFormData.current_year_data?.revenue &&
            currentFormData.current_year_data.revenue > 0)
        const hasEbitda =
          currentFormData.ebitda ||
          (currentFormData.current_year_data?.ebitda &&
            currentFormData.current_year_data.ebitda > 0)
        const hasUserEnteredCompanyName = currentFormData.company_name && currentFormData.company_name.trim() !== ''
        const hasUserSelectedBusinessType = currentFormData.business_type_id && currentFormData.business_type_id !== ''
        const hasUserEnteredFoundingYear = currentFormData.founding_year && 
          currentFormData.founding_year !== (new Date().getFullYear() - 5) // Not the default
        const hasUserSelectedCountry = currentFormData.country_code && 
          currentFormData.country_code !== 'BE' // Not the default
        
        // ✅ ACCOUNTANT WORKFLOW FIX: If this is an accountant session with business card data,
        // consider form "empty" even if it has defaults, so we restore business card fields
        formIsEmpty =
          (!hasUserEnteredCompanyName &&
          !hasUserSelectedBusinessType &&
          !hasUserEnteredFoundingYear &&
          !hasUserSelectedCountry &&
          !hasRevenue &&
          !hasEbitda &&
          // Check if industry is still default value (not user-entered)
          (currentFormData.industry === 'services' || !currentFormData.industry)) ||
          // OVERRIDE: Always restore if accountant session with business card data
          (isAccountantSession && hasBusinessCardData)

        // ✅ FIX: Check for session data in both flat and nested structures
        // Revenue/EBITDA might be in current_year_data.revenue or at top level
        // ✅ FIX: Check if company_name exists (even if empty string) - it's a key field
        // ✅ FIX: Also check for business card fields (company_name, business_type_id, founding_year, country_code)
        // These indicate business card data from Mercury that should be restored
        hasSessionData = !!(
          sessionDataObj.company_name !== undefined || // Include even if empty string
          sessionDataObj.business_type_id || // Business type from business card
          sessionDataObj.founding_year || // Founding year from business card
          sessionDataObj.country_code || // Country from business card
          sessionDataObj.revenue ||
          sessionDataObj.ebitda ||
          sessionDataObj.current_year_data?.revenue ||
          sessionDataObj.current_year_data?.ebitda
        )

        generalLogger.info('[ManualLayout] Form restoration check', {
          reportId,
          formIsEmpty,
          hasSessionData,
          isAccountantSession,
          hasBusinessCardData,
          hasFinancialData,
          hasCompanyName: !!sessionDataObj.company_name,
          companyName: sessionDataObj.company_name,
          hasBusinessTypeId: !!sessionDataObj.business_type_id,
          businessTypeId: sessionDataObj.business_type_id,
          hasFoundingYear: !!sessionDataObj.founding_year,
          foundingYear: sessionDataObj.founding_year,
          hasCountryCode: !!sessionDataObj.country_code,
          countryCode: sessionDataObj.country_code,
          hasRevenue: !!(sessionDataObj.revenue || sessionDataObj.current_year_data?.revenue),
          hasEbitda: !!(sessionDataObj.ebitda || sessionDataObj.current_year_data?.ebitda),
          willRestore: hasSessionData && formIsEmpty,
          restorationReason: hasSessionData && formIsEmpty
            ? isAccountantSession && hasBusinessCardData
              ? 'ACCOUNTANT_SESSION_WITH_BUSINESS_CARD'
              : 'FORM_EMPTY_WITH_SESSION_DATA'
            : 'SKIP_RESTORATION',
        })

        if (hasSessionData && formIsEmpty) {
          // ✅ ACCOUNTANT WORKFLOW: Log prominent message when restoring business card data
          if (isAccountantSession && hasBusinessCardData) {
            console.log(
              '%c🔄 RESTORING BUSINESS CARD DATA FROM MERCURY',
              'background: #4CAF50; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;',
              {
                company_name: sessionDataObj.company_name,
                business_type_id: sessionDataObj.business_type_id,
                founding_year: sessionDataObj.founding_year,
                country_code: sessionDataObj.country_code,
              }
            )
          }
          // ✅ FIX: Get company_name from result as fallback if not in sessionData
          // The company_name might be in the valuation result but not yet synced to sessionData
          // ✅ FIX: Check if sessionCompanyName is a non-empty string, not just defined
          // Empty string should be treated as missing data
          const resultCompanyName = result?.company_name
          const sessionCompanyName = sessionDataObj.company_name
          const hasValidSessionCompanyName = sessionCompanyName && sessionCompanyName.trim() !== ''
          const companyNameToRestore = hasValidSessionCompanyName
            ? sessionCompanyName
            : resultCompanyName && resultCompanyName.trim() !== ''
            ? resultCompanyName
            : undefined

          generalLogger.info('[ManualLayout] Company name restoration check', {
            reportId,
            sessionCompanyName,
            resultCompanyName,
            companyNameToRestore,
            sessionHasCompanyName: sessionCompanyName !== undefined,
            resultHasCompanyName: !!resultCompanyName,
          })

          // ✅ FIX: Properly map sessionData to formData format
          // Handle both flat and nested structures (revenue/ebitda might be in current_year_data)
          const formDataUpdate: Partial<any> = {
            // Basic company information
            // ✅ FIX: Use company_name from sessionData or result (fallback)
            company_name: companyNameToRestore,
            country_code: sessionDataObj.country_code,
            industry: sessionDataObj.industry,
            subIndustry: sessionDataObj.subIndustry, // ✅ NEW: Include sub-industry field
            business_model: sessionDataObj.business_model,
            founding_year: sessionDataObj.founding_year,

            // Business details
            business_type: sessionDataObj.business_type,
            business_type_id: sessionDataObj.business_type_id,
            business_description: sessionDataObj.business_description,
            business_highlights: sessionDataObj.business_highlights,
            reason_for_selling: sessionDataObj.reason_for_selling,
            city: sessionDataObj.city,

            // Financials - handle both nested and flat structures
            revenue: sessionDataObj.current_year_data?.revenue || sessionDataObj.revenue,
            ebitda: sessionDataObj.current_year_data?.ebitda || sessionDataObj.ebitda,
            // ✅ FIX: Preserve all fields from existing current_year_data, merge with defaults if needed
            current_year_data: sessionDataObj.current_year_data
              ? {
                  ...sessionDataObj.current_year_data,
                  // Ensure revenue/ebitda are set (might be at top level)
                  revenue: sessionDataObj.current_year_data.revenue ?? sessionDataObj.revenue ?? 0,
                  ebitda: sessionDataObj.current_year_data.ebitda ?? sessionDataObj.ebitda ?? 0,
                  // Ensure year is set
                  year: sessionDataObj.current_year_data.year ?? new Date().getFullYear(),
                }
              : {
                  year: new Date().getFullYear(),
                  revenue: sessionDataObj.revenue ?? 0,
                  ebitda: sessionDataObj.ebitda ?? 0,
                },
            historical_years_data: sessionDataObj.historical_years_data,
            recurring_revenue_percentage: sessionDataObj.recurring_revenue_percentage,

            // Ownership
            number_of_employees: sessionDataObj.number_of_employees,
            number_of_owners: sessionDataObj.number_of_owners,
            shares_for_sale: sessionDataObj.shares_for_sale,

            // Other
            comparables: sessionDataObj.comparables,
            
            // ✅ FIX: Ensure KBO data is preserved in business_context for company preview card
            // If KBO data exists in session but not in business_context, merge it
            business_context: (sessionDataObj.kbo_registration || sessionDataObj.kbo_registration_number || sessionDataObj.legal_form || sessionDataObj.company_address || sessionDataObj.company_status) ? {
              ...(sessionDataObj.business_context || {}),
              kbo_registration: sessionDataObj.kbo_registration || sessionDataObj.kbo_registration_number,
              kbo_registration_number: sessionDataObj.kbo_registration_number || sessionDataObj.kbo_registration,
              legal_form: sessionDataObj.legal_form,
              company_id: sessionDataObj.company_id,
              company_address: sessionDataObj.company_address,
              company_status: sessionDataObj.company_status || 'Active',
            } : sessionDataObj.business_context,
          }

          // ✅ FIX: Remove undefined values but preserve empty strings and null
          // Empty strings are valid values (e.g., user cleared a field)
          // Only remove truly undefined values
          // CRITICAL: Preserve company_name even if empty string (it's a required field that user may have entered)
          Object.keys(formDataUpdate).forEach((key) => {
            // Special handling for company_name - always include if it exists in sessionData (even if empty string)
            if (key === 'company_name') {
              // Only remove if it was never set in sessionData (undefined)
              if (formDataUpdate[key] === undefined && sessionDataObj.company_name === undefined) {
                delete formDataUpdate[key]
              }
            } else if (formDataUpdate[key] === undefined) {
              delete formDataUpdate[key]
            }
          })

          generalLogger.info('[ManualLayout] Restoring form from session', {
            reportId,
            fieldsToRestore: Object.keys(formDataUpdate),
            businessCardFields: {
              company_name: formDataUpdate.company_name,
              business_type_id: formDataUpdate.business_type_id,
              founding_year: formDataUpdate.founding_year,
              country_code: formDataUpdate.country_code,
            },
            hasRevenue: !!formDataUpdate.revenue,
            hasEbitda: !!formDataUpdate.ebitda,
            hasCurrentYearData: !!formDataUpdate.current_year_data,
            hasBusinessDescription: !!formDataUpdate.business_description,
            hasBusinessHighlights: !!formDataUpdate.business_highlights,
            hasReasonForSelling: !!formDataUpdate.reason_for_selling,
            hasCity: !!formDataUpdate.city,
            hasHistoricalData: !!(
              formDataUpdate.historical_years_data &&
              Array.isArray(formDataUpdate.historical_years_data) &&
              formDataUpdate.historical_years_data.length > 0
            ),
            historicalDataCount: formDataUpdate.historical_years_data?.length || 0,
            historicalDataYears:
              formDataUpdate.historical_years_data?.map((h: any) => h.year) || [],
          })

          // ✅ LOGGING: Detailed historical data restoration logging
          if (
            formDataUpdate.historical_years_data &&
            Array.isArray(formDataUpdate.historical_years_data) &&
            formDataUpdate.historical_years_data.length > 0
          ) {
            generalLogger.debug('[ManualLayout] Restoring historical data', {
              reportId,
              hasHistoricalData: true,
              historicalDataCount: formDataUpdate.historical_years_data.length,
              historicalYears: formDataUpdate.historical_years_data.map((h: any) => h.year),
              historicalDataDetails: formDataUpdate.historical_years_data.map((h: any) => ({
                year: h.year,
                hasRevenue: !!(h.revenue && h.revenue > 0),
                revenue: h.revenue,
                hasEbitda: !!(h.ebitda && h.ebitda > 0),
                ebitda: h.ebitda,
              })),
            })
          }

          updateFormDataFn(formDataUpdate)

          // ✅ FIX: Force a re-render by reading updated formData after a brief delay
          // This ensures the form component receives the updated data
          setTimeout(() => {
            const restoredFormData = useManualFormStore.getState().formData
            
            // ✅ ACCOUNTANT WORKFLOW: Verify business card fields were restored
            if (isAccountantSession && hasBusinessCardData) {
              console.log(
                '%c✅ BUSINESS CARD DATA RESTORED',
                'background: #2196F3; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;',
                {
                  company_name: {
                    expected: formDataUpdate.company_name,
                    actual: restoredFormData.company_name,
                    match: restoredFormData.company_name === formDataUpdate.company_name,
                  },
                  business_type_id: {
                    expected: formDataUpdate.business_type_id,
                    actual: restoredFormData.business_type_id,
                    match: restoredFormData.business_type_id === formDataUpdate.business_type_id,
                  },
                  founding_year: {
                    expected: formDataUpdate.founding_year,
                    actual: restoredFormData.founding_year,
                    match: restoredFormData.founding_year === formDataUpdate.founding_year,
                  },
                  country_code: {
                    expected: formDataUpdate.country_code,
                    actual: restoredFormData.country_code,
                    match: restoredFormData.country_code === formDataUpdate.country_code,
                  },
                }
              )
            }
            
            generalLogger.info('[ManualLayout] Form data restored (verified)', {
              reportId,
              companyName: restoredFormData.company_name,
              companyNameLength: restoredFormData.company_name?.length || 0,
              companyNameFromUpdate: formDataUpdate.company_name,
              companyNameMatch: restoredFormData.company_name === formDataUpdate.company_name,
              revenue: restoredFormData.revenue,
              ebitda: restoredFormData.ebitda,
              industry: restoredFormData.industry,
              formDataKeys: Object.keys(restoredFormData),
              // Verify the values match what we tried to restore
              restorationMatch: {
                revenue: restoredFormData.revenue === formDataUpdate.revenue,
                ebitda: restoredFormData.ebitda === formDataUpdate.ebitda,
                companyName: restoredFormData.company_name === formDataUpdate.company_name,
                companyNameExact: restoredFormData.company_name === formDataUpdate.company_name,
              },
            })

            // ✅ FIX: If company_name is still empty after restoration, log warning
            if (!restoredFormData.company_name && formDataUpdate.company_name) {
              generalLogger.warn('[ManualLayout] Company name not restored properly', {
                reportId,
                expectedCompanyName: formDataUpdate.company_name,
                actualCompanyName: restoredFormData.company_name,
                sessionDataCompanyName: sessionDataObj.company_name,
                note: 'Company name may need manual re-entry',
              })
            }
          }, 100)
        } else if (hasSessionData && !formIsEmpty) {
          // ✅ FIX: Even if form has some data, restore missing critical fields (company_name, business_type_id)
          // These are essential business card fields that should always be restored if missing
          const missingCriticalFields: Partial<any> = {}
          
          if (!hasUserEnteredCompanyName && sessionDataObj.company_name) {
            missingCriticalFields.company_name = sessionDataObj.company_name
          }
          if (!hasUserSelectedBusinessType && sessionDataObj.business_type_id) {
            missingCriticalFields.business_type_id = sessionDataObj.business_type_id
          }
          if (!hasUserEnteredFoundingYear && sessionDataObj.founding_year) {
            missingCriticalFields.founding_year = sessionDataObj.founding_year
          }
          if (!hasUserSelectedCountry && sessionDataObj.country_code) {
            missingCriticalFields.country_code = sessionDataObj.country_code
          }
          
          if (Object.keys(missingCriticalFields).length > 0) {
            const { updateFormData: updateFormDataFn } = useManualFormStore.getState()
            updateFormDataFn(missingCriticalFields)
            generalLogger.info('[ManualLayout] Restored missing critical fields', {
              reportId,
              restoredFields: Object.keys(missingCriticalFields),
              company_name: missingCriticalFields.company_name,
              business_type_id: missingCriticalFields.business_type_id,
            })
          } else {
            generalLogger.warn('[ManualLayout] Skipping form restoration - form already has data', {
              reportId,
              formHasCompanyName: !!currentFormData.company_name,
              formHasRevenue: !!currentFormData.revenue,
              formHasEbitda: !!currentFormData.ebitda,
              formHasIndustry: !!currentFormData.industry,
            })
          }
        } else if (!hasSessionData) {
          // ✅ FIX: Downgrade to DEBUG - this is expected for NEW reports (no session data yet)
          generalLogger.debug(
            '[ManualLayout] Skipping form restoration - no session data (NEW report)',
            {
              reportId,
              note: 'Expected behavior for new reports - session data will be populated after form submission',
            }
          )
        }
      } else {
        // ✅ FIX: Downgrade to DEBUG - this is expected for NEW reports
        generalLogger.debug('[ManualLayout] No sessionData found for restoration (NEW report)', {
          reportId,
          hasSession: !!currentSession,
          sessionKeys: currentSession ? Object.keys(currentSession) : [],
          note: 'Expected behavior for new reports - session data will be populated after form submission',
        })
      }

      // Restore results - CRITICAL FIX: Merge HTML reports from session into result object
      if (currentSession.valuationResult) {
        const currentResult = useManualResultsStore.getState().result
        const shouldRestoreResult =
          !currentResult ||
          currentResult.valuation_id !== currentSession.valuationResult.valuation_id
        const resultMissingHtml =
          currentResult && !currentResult.html_report && !!currentSession.htmlReport
        const resultMissingInfoTab =
          currentResult && !currentResult.info_tab_html && !!currentSession.infoTabHtml

        // ✅ FIX: Restore if result doesn't exist, has different ID, OR is missing HTML reports
        if (shouldRestoreResult || resultMissingHtml || resultMissingInfoTab) {
          generalLogger.info('[ManualLayout] Restoring result with HTML assets', {
            reportId,
            shouldRestoreResult,
            resultMissingHtml,
            resultMissingInfoTab,
            hasHtmlReport: !!currentSession.htmlReport,
            hasInfoTabHtml: !!currentSession.infoTabHtml,
            htmlReportLength: currentSession.htmlReport?.length || 0,
            infoTabHtmlLength: currentSession.infoTabHtml?.length || 0,
          })

          // Merge HTML reports from session into result object (they're stored separately in DB)
          const resultWithHtml = {
            ...(currentResult || currentSession.valuationResult),
            ...currentSession.valuationResult, // Ensure we have latest valuation result
            html_report:
              currentSession.htmlReport ||
              currentResult?.html_report ||
              currentSession.valuationResult.html_report,
            info_tab_html:
              currentSession.infoTabHtml ||
              currentResult?.info_tab_html ||
              currentSession.valuationResult.info_tab_html,
          }

          setResultFn(resultWithHtml as any)

          // Verify restoration was successful
          const restoredResult = useManualResultsStore.getState().result
          if (restoredResult && !restoredResult.html_report && currentSession.htmlReport) {
            generalLogger.error(
              '[ManualLayout] RESTORATION FAILED: html_report missing after setResult',
              {
                reportId,
                valuationId: restoredResult.valuation_id,
                sessionHadHtmlReport: !!currentSession.htmlReport,
              }
            )
          } else if (restoredResult?.html_report) {
            generalLogger.info('[ManualLayout] RESTORATION SUCCESS: HTML report restored', {
              reportId,
              valuationId: restoredResult.valuation_id,
              htmlReportLength: restoredResult.html_report.length,
              infoTabHtmlLength: restoredResult.info_tab_html?.length || 0,
            })
          }
        }
      }

      // ✅ FIX: Mark as restored ONLY if we actually restored form data
      // This allows reactive restoration to trigger if session loads later
      // We check if restoration happened inside the try block above
      // If session wasn't ready, don't mark - let reactive effect handle it
      if (currentSession.sessionData && hasSessionData && formIsEmpty) {
        restorationRef.current.lastRestoredReportId = reportId
        generalLogger.info('[ManualLayout] Form restoration completed, marked as restored', {
          reportId,
        })
      } else if (!currentSession.sessionData) {
        // Session not ready yet - don't mark as restored, let reactive effect handle it
        generalLogger.debug('[ManualLayout] Session not ready, will retry via reactive effect', {
          reportId,
        })
      } else {
        // Form not empty or no session data - mark as processed to prevent infinite retries
        restorationRef.current.lastRestoredReportId = reportId
      }

      // ✅ FIX: Only mark as saved if restoring an existing report that was explicitly saved by user
      // Don't mark new reports as saved (they haven't been explicitly saved by user yet)
      // Check for actual user-entered financial data (revenue/ebitda), not just prefilled company_name
      const sessionData = currentSession.sessionData as any
      const hasUserEnteredData =
        sessionData &&
        typeof sessionData === 'object' &&
        // Check for actual financial data entered by user (not just prefilled company_name)
        (sessionData.revenue ||
          sessionData.ebitda ||
          sessionData.current_year_data?.revenue ||
          sessionData.current_year_data?.ebitda)

      // Only mark as saved if session was explicitly updated (has updatedAt) AND has user-entered data
      const wasExplicitlySaved = currentSession.updatedAt && hasUserEnteredData

      if (wasExplicitlySaved) {
        // Existing report with user-entered data that was explicitly saved - mark as saved
        useSessionStore.getState().markSaved()
        generalLogger.info(
          '[ManualLayout] Session marked as saved after restoration (existing report with user data)',
          {
            reportId,
            hasUpdatedAt: !!currentSession.updatedAt,
            hasUserEnteredData,
          }
        )
      } else {
        // New report or report without explicit user saves - don't mark as saved yet
        generalLogger.debug(
          '[ManualLayout] Skipping markSaved - new report or no explicit user saves yet',
          {
            reportId,
            hasUpdatedAt: !!currentSession.updatedAt,
            hasUserEnteredData,
            note: 'Expected behavior for new reports - will be marked as saved after user makes changes',
          }
        )
      }
    } finally {
      restorationRef.current.isRestoring = false
    }
  }, [reportId]) // ONLY depend on reportId prop - this ensures effect only runs when navigating to a new report

  // ✅ FIX: Subscribe to session to detect when HTML reports are added
  // This handles the case where HTML reports are loaded after initial restoration
  // (e.g., after PUT /result completes and session is reloaded)
  const sessionHtmlReport = useSessionStore((state) => state.session?.htmlReport)
  const sessionInfoTabHtml = useSessionStore((state) => state.session?.infoTabHtml)
  const sessionValuationResult = useSessionStore((state) => state.session?.valuationResult)

  // ✅ FIX: Subscribe to sessionData to detect when form fields are loaded
  // This handles the case where sessionData loads from cache/backend after component mounts
  // Form fields should be restored just like HTML reports
  const sessionData = useSessionStore((state) => state.session?.sessionData)

  // ✅ FIX: Separate effect to restore form fields when sessionData becomes available
  // This handles the case where sessionData loads from cache/backend after component mounts
  // Similar to HTML report restoration, but for input fields
  useEffect(() => {
    if (!reportId || !sessionData) return

    // Only restore if we haven't already restored for this reportId
    if (restorationRef.current.lastRestoredReportId === reportId) {
      return
    }

    // Prevent concurrent restoration
    if (restorationRef.current.isRestoring) {
      return
    }

    const currentSession = useSessionStore.getState().session
    if (!currentSession || currentSession.reportId !== reportId) {
      return
    }

    const currentFormData = useManualFormStore.getState().formData

    // Check if form is empty (same logic as main restoration)
    // ✅ FIX: Don't consider form "filled" if it only has default values
    const hasRevenue =
      currentFormData.revenue ||
      (currentFormData.current_year_data?.revenue && currentFormData.current_year_data.revenue > 0)
    const hasEbitda =
      currentFormData.ebitda ||
      (currentFormData.current_year_data?.ebitda && currentFormData.current_year_data.ebitda > 0)
    const hasUserEnteredCompanyName = currentFormData.company_name && currentFormData.company_name.trim() !== ''
    const hasUserSelectedBusinessType = currentFormData.business_type_id && currentFormData.business_type_id !== ''
    const hasUserEnteredFoundingYear = currentFormData.founding_year && 
      currentFormData.founding_year !== (new Date().getFullYear() - 5) // Not the default
    const hasUserSelectedCountry = currentFormData.country_code && 
      currentFormData.country_code !== 'BE' // Not the default
    
    const formIsEmpty =
      !hasUserEnteredCompanyName &&
      !hasUserSelectedBusinessType &&
      !hasUserEnteredFoundingYear &&
      !hasUserSelectedCountry &&
      !hasRevenue &&
      !hasEbitda &&
      (currentFormData.industry === 'services' || !currentFormData.industry)

    const sessionDataObj = sessionData as any
    // ✅ FIX: Check if company_name exists (even if empty string) - it's a key field
    // ✅ FIX: Also check for business card fields (company_name, business_type_id, founding_year, country_code)
    // These indicate business card data from Mercury that should be restored
    // CRITICAL: Check for ANY business card field - even if one is missing, others should still restore
    const hasBusinessCardData =
      sessionDataObj.company_name !== undefined || // Include even if empty string
      sessionDataObj.business_type_id || // Business type from business card
      sessionDataObj.founding_year || // Founding year from business card
      sessionDataObj.country_code || // Country from business card
      sessionDataObj.industry // Industry from business card
    
    const hasFinancialData =
      sessionDataObj.revenue ||
      sessionDataObj.ebitda ||
      sessionDataObj.current_year_data?.revenue ||
      sessionDataObj.current_year_data?.ebitda
    
    const hasSessionData = hasBusinessCardData || hasFinancialData

    if (hasSessionData && formIsEmpty) {
      generalLogger.info('[ManualLayout] Restoring form fields from sessionData (reactive)', {
        reportId,
        hasSessionData: true,
        formIsEmpty: true,
        source: 'sessionData subscription',
      })

      // Use the same restoration logic as the main effect
      const { updateFormData: updateFormDataFn } = useManualFormStore.getState()
      const { result: currentResult } = useManualResultsStore.getState()

      // ✅ FIX: Get company_name from result as fallback if not in sessionData
      // The company_name might be in the valuation result but not yet synced to sessionData
      const resultCompanyName = currentResult?.company_name
      const sessionCompanyName = sessionDataObj.company_name
      const companyNameToRestore =
        sessionCompanyName !== undefined ? sessionCompanyName : resultCompanyName || undefined

      generalLogger.info('[ManualLayout] Company name restoration check (reactive)', {
        reportId,
        sessionCompanyName,
        resultCompanyName,
        companyNameToRestore,
        sessionHasCompanyName: sessionCompanyName !== undefined,
        resultHasCompanyName: !!resultCompanyName,
      })

      const formDataUpdate: Partial<any> = {
        // ✅ FIX: Use company_name from sessionData or result (fallback)
        company_name: companyNameToRestore,
        country_code: sessionDataObj.country_code,
        industry: sessionDataObj.industry,
        subIndustry: sessionDataObj.subIndustry, // ✅ NEW: Include sub-industry field
        business_model: sessionDataObj.business_model,
        founding_year: sessionDataObj.founding_year,
        business_type: sessionDataObj.business_type,
        business_type_id: sessionDataObj.business_type_id,
        business_description: sessionDataObj.business_description,
        business_highlights: sessionDataObj.business_highlights,
        reason_for_selling: sessionDataObj.reason_for_selling,
        city: sessionDataObj.city,
        revenue: sessionDataObj.current_year_data?.revenue || sessionDataObj.revenue,
        ebitda: sessionDataObj.current_year_data?.ebitda || sessionDataObj.ebitda,
        current_year_data: sessionDataObj.current_year_data
          ? {
              ...sessionDataObj.current_year_data,
              revenue: sessionDataObj.current_year_data.revenue ?? sessionDataObj.revenue ?? 0,
              ebitda: sessionDataObj.current_year_data.ebitda ?? sessionDataObj.ebitda ?? 0,
              year: sessionDataObj.current_year_data.year ?? new Date().getFullYear(),
            }
          : {
              year: new Date().getFullYear(),
              revenue: sessionDataObj.revenue ?? 0,
              ebitda: sessionDataObj.ebitda ?? 0,
            },
        historical_years_data: sessionDataObj.historical_years_data,
        recurring_revenue_percentage: sessionDataObj.recurring_revenue_percentage,
        // ✅ LOGGING: Verify historical data is included in reactive restoration
        number_of_employees: sessionDataObj.number_of_employees,
        number_of_owners: sessionDataObj.number_of_owners,
        shares_for_sale: sessionDataObj.shares_for_sale,
        comparables: sessionDataObj.comparables,
        business_context: sessionDataObj.business_context,
      }

      // ✅ FIX: Remove undefined values but preserve empty strings and null
      // Empty strings are valid values (e.g., user cleared a field)
      // Only remove truly undefined values
      // CRITICAL: Preserve company_name even if empty string (it's a required field that user may have entered)
      Object.keys(formDataUpdate).forEach((key) => {
        // Special handling for company_name - always include if it exists in sessionData (even if empty string)
        if (key === 'company_name') {
          // Only remove if it was never set in sessionData (undefined)
          if (formDataUpdate[key] === undefined && sessionDataObj.company_name === undefined) {
            delete formDataUpdate[key]
          }
        } else if (formDataUpdate[key] === undefined) {
          delete formDataUpdate[key]
        }
      })

      generalLogger.info('[ManualLayout] Restoring form fields from sessionData (reactive)', {
        reportId,
        fieldsToRestore: Object.keys(formDataUpdate),
        hasCompanyName: !!formDataUpdate.company_name,
        companyName: formDataUpdate.company_name,
        hasRevenue: !!formDataUpdate.revenue,
        hasEbitda: !!formDataUpdate.ebitda,
        hasBusinessDescription: !!formDataUpdate.business_description,
        hasBusinessHighlights: !!formDataUpdate.business_highlights,
        hasReasonForSelling: !!formDataUpdate.reason_for_selling,
        hasCity: !!formDataUpdate.city,
        hasHistoricalData: !!(
          formDataUpdate.historical_years_data &&
          Array.isArray(formDataUpdate.historical_years_data) &&
          formDataUpdate.historical_years_data.length > 0
        ),
        historicalDataCount: formDataUpdate.historical_years_data?.length || 0,
        historicalDataYears: formDataUpdate.historical_years_data?.map((h: any) => h.year) || [],
      })

      // ✅ LOGGING: Detailed historical data restoration logging (reactive)
      if (
        formDataUpdate.historical_years_data &&
        Array.isArray(formDataUpdate.historical_years_data) &&
        formDataUpdate.historical_years_data.length > 0
      ) {
        generalLogger.debug('[ManualLayout] Restoring historical data (reactive)', {
          reportId,
          hasHistoricalData: true,
          historicalDataCount: formDataUpdate.historical_years_data.length,
          historicalYears: formDataUpdate.historical_years_data.map((h: any) => h.year),
          historicalDataDetails: formDataUpdate.historical_years_data.map((h: any) => ({
            year: h.year,
            hasRevenue: !!(h.revenue && h.revenue > 0),
            revenue: h.revenue,
            hasEbitda: !!(h.ebitda && h.ebitda > 0),
            ebitda: h.ebitda,
          })),
        })
      }

      updateFormDataFn(formDataUpdate)
      restorationRef.current.lastRestoredReportId = reportId

      // ✅ FIX: Verify restoration after a brief delay to ensure form component receives updates
      setTimeout(() => {
        const restoredFormData = useManualFormStore.getState().formData
        generalLogger.info(
          '[ManualLayout] Form fields restored from sessionData (reactive, verified)',
          {
            reportId,
            fieldsRestored: Object.keys(formDataUpdate).length,
            companyName: restoredFormData.company_name,
            revenue: restoredFormData.revenue,
            ebitda: restoredFormData.ebitda,
            hasHistoricalData: !!(
              restoredFormData.historical_years_data &&
              Array.isArray(restoredFormData.historical_years_data) &&
              restoredFormData.historical_years_data.length > 0
            ),
            restorationMatch: {
              revenue: restoredFormData.revenue === formDataUpdate.revenue,
              ebitda: restoredFormData.ebitda === formDataUpdate.ebitda,
              companyName: restoredFormData.company_name === formDataUpdate.company_name,
              businessDescription:
                restoredFormData.business_description === formDataUpdate.business_description,
              businessHighlights:
                restoredFormData.business_highlights === formDataUpdate.business_highlights,
              reasonForSelling:
                restoredFormData.reason_for_selling === formDataUpdate.reason_for_selling,
              city: restoredFormData.city === formDataUpdate.city,
            },
          }
        )
      }, 100)

      // ✅ FIX: Mark as saved if restoring an existing report that was explicitly saved by user
      // Same logic as main restoration effect
      const sessionDataForCheck = sessionDataObj
      const hasUserEnteredData =
        sessionDataForCheck &&
        typeof sessionDataForCheck === 'object' &&
        (sessionDataForCheck.revenue ||
          sessionDataForCheck.ebitda ||
          sessionDataForCheck.current_year_data?.revenue ||
          sessionDataForCheck.current_year_data?.ebitda)

      const wasExplicitlySaved = currentSession.updatedAt && hasUserEnteredData

      if (wasExplicitlySaved) {
        useSessionStore.getState().markSaved()
        generalLogger.info('[ManualLayout] Session marked as saved after reactive restoration', {
          reportId,
          hasUpdatedAt: !!currentSession.updatedAt,
          hasUserEnteredData,
        })
      }
    } else if (hasSessionData && !formIsEmpty) {
      // Form already has data - mark as processed to prevent retries
      restorationRef.current.lastRestoredReportId = reportId
      generalLogger.debug('[ManualLayout] Skipping reactive restoration - form already has data', {
        reportId,
        formHasCompanyName: !!currentFormData.company_name,
        formHasRevenue: !!currentFormData.revenue,
        formHasEbitda: !!currentFormData.ebitda,
      })
    }
  }, [reportId, sessionData]) // Watch for sessionData changes

  // ✅ FIX: Separate effect to restore HTML reports when they're added to session
  useEffect(() => {
    if (!reportId) return

    const currentSession = useSessionStore.getState().session
    if (!currentSession || currentSession.reportId !== reportId) {
      return
    }

    // Check if session has HTML reports but result doesn't
    const hasHtmlReportInSession = !!sessionHtmlReport
    const hasInfoTabHtmlInSession = !!sessionInfoTabHtml
    const currentResult = useManualResultsStore.getState().result

    if (!hasHtmlReportInSession && !hasInfoTabHtmlInSession) {
      return // No HTML reports to restore
    }

    // Check if result is missing HTML reports
    const resultMissingHtml = currentResult && !currentResult.html_report && hasHtmlReportInSession
    const resultMissingInfoTab =
      currentResult && !currentResult.info_tab_html && hasInfoTabHtmlInSession

    if (resultMissingHtml || resultMissingInfoTab) {
      generalLogger.info('[ManualLayout] HTML reports detected in session, restoring to result', {
        reportId,
        hasHtmlReportInSession,
        hasInfoTabHtmlInSession,
        resultMissingHtml,
        resultMissingInfoTab,
        hasExistingResult: !!currentResult,
      })

      const { setResult: setResultFn } = useManualResultsStore.getState()

      // Merge HTML reports into existing result
      if (currentResult) {
        const resultWithHtml = {
          ...currentResult,
          html_report: sessionHtmlReport || currentResult.html_report,
          info_tab_html: sessionInfoTabHtml || currentResult.info_tab_html,
        }
        setResultFn(resultWithHtml as any)
        generalLogger.info('[ManualLayout] HTML reports restored to existing result', {
          reportId,
          htmlReportLength: resultWithHtml.html_report?.length || 0,
          infoTabHtmlLength: resultWithHtml.info_tab_html?.length || 0,
        })
      } else if (sessionValuationResult) {
        // No result yet, but we have valuation result - restore it with HTML
        const resultWithHtml = {
          ...sessionValuationResult,
          html_report: sessionHtmlReport || sessionValuationResult.html_report,
          info_tab_html: sessionInfoTabHtml || sessionValuationResult.info_tab_html,
        }
        setResultFn(resultWithHtml as any)
        generalLogger.info('[ManualLayout] HTML reports restored with valuation result', {
          reportId,
          htmlReportLength: resultWithHtml.html_report?.length || 0,
          infoTabHtmlLength: resultWithHtml.info_tab_html?.length || 0,
        })
      }
    }
  }, [reportId, sessionHtmlReport, sessionInfoTabHtml, sessionValuationResult])

  // Panel resize hook
  const { leftPanelWidth, handleResize, isMobile, mobileActivePanel, setMobileActivePanel } =
    useManualPanelResize()

  // Toolbar hooks
  const { activeTab, handleTabChange: handleHookTabChange } = useValuationToolbarTabs()
  const { handleRefresh, handleDownload, isDownloading } = useManualToolbar({ result })
  const {
    isFullScreen,
    handleOpenFullscreen: handleHookOpenFullscreen,
    handleCloseFullscreen: handleHookCloseFullscreen,
  } = useValuationToolbarFullscreen()

  // Handle valuation completion when result changes
  useEffect(() => {
    if (result) {
      onComplete(result)
    }
  }, [result, onComplete])

  // ✅ FIX: Get company name from formData (current input) or result (after calculation)
  // This ensures valuation name updates as user types company name
  const formCompanyName = useManualFormStore((state) => state.formData.company_name)
  const resultCompanyName = result?.company_name
  const companyName = formCompanyName || resultCompanyName

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar (Save Status integrated inside toolbar) */}
      <ValuationToolbar
        onRefresh={handleRefresh}
        onDownload={handleDownload}
        onFullScreen={handleHookOpenFullscreen}
        isGenerating={isCalculating || isDownloading}
        user={user}
        valuationName="Valuation"
        valuationId={result?.valuation_id}
        activeTab={activeTab}
        onTabChange={(tab) => {
          handleHookTabChange(tab as 'preview' | 'info' | 'history')
        }}
        companyName={companyName}
      />

      {/* Split Panel */}
      <div
        className="flex flex-col lg:flex-row flex-1 overflow-hidden mx-4 my-4 rounded-lg border border-zinc-800"
        style={{ transition: 'width 150ms ease-out' }}
      >
        {/* Left Panel: Form */}
        <div
          className={`${
            isMobile ? (mobileActivePanel === 'form' ? 'w-full' : 'hidden') : ''
          } h-full flex flex-col bg-zinc-900 border-r border-zinc-800 w-full lg:w-auto overflow-y-auto`}
          style={{
            width: isMobile ? '100%' : `${leftPanelWidth}%`,
          }}
        >
          <div className="flex-1 p-6">
            {/* ValuationForm - Main form inputs with Suspense boundary */}
            <Suspense fallback={<InputFieldsSkeleton />}>
              <ValuationForm
                initialVersion={initialVersion}
                isRegenerationMode={initialMode === 'edit' && !!initialVersion}
              />
            </Suspense>
          </div>
        </div>

        {/* Resizable Divider */}
        <ResizableDivider onResize={handleResize} leftWidth={leftPanelWidth} isMobile={isMobile} />

        {/* Right Panel: Report Display */}
        <div
          className={`${
            isMobile ? (mobileActivePanel === 'preview' ? 'w-full' : 'hidden') : ''
          } h-full min-h-[400px] lg:min-h-0 w-full lg:w-auto border-t lg:border-t-0 border-zinc-800`}
          style={{ width: isMobile ? '100%' : `${100 - leftPanelWidth}%` }}
        >
          <ReportPanel
            reportId={reportId}
            activeTab={activeTab as 'preview' | 'info' | 'history'}
            onTabChange={(tab: 'preview' | 'info' | 'history') => {
              handleHookTabChange(tab as ValuationTab)
            }}
            isCalculating={isCalculating}
            error={error}
            result={result}
            onClearError={() => {
              const { clearError } = useManualResultsStore.getState()
              clearError()
            }}
          />
        </div>
      </div>

      {/* Mobile Panel Switcher */}
      {isMobile && (
        <MobilePanelSwitcher activePanel={mobileActivePanel} onPanelChange={setMobileActivePanel} />
      )}

      {/* Full Screen Modal */}
      <FullScreenModal
        isOpen={isFullScreen}
        onClose={handleHookCloseFullscreen}
        title="Valuation - Full Screen"
      >
        <ReportPanel
          reportId={reportId}
          className="h-full"
          activeTab={activeTab}
          onTabChange={(tab) => {
            handleHookTabChange(tab as 'preview' | 'info' | 'history')
          }}
          isCalculating={isCalculating}
          error={error}
          result={result}
          onClearError={() => {
            const { clearError } = useManualResultsStore.getState()
            clearError()
          }}
        />
      </FullScreenModal>

      {/* Asset Inspector (dev only) */}
      <AssetInspector />
    </div>
  )
}
