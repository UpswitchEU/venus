/**
 * useValuationFormSubmission Hook
 *
 * Single Responsibility: Form submission logic and validation
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/hooks/useValuationFormSubmission
 */

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { trackValuationCalculate, trackValuationResult } from '@/lib/analytics'
import { useCanSave } from '../../../hooks/useCanSave'
import { reportService, sessionService, valuationService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { ValidationError } from '../../../types/errors'
import { buildValuationRequest } from '../../../utils/buildValuationRequest'
import { persistNormalizationsBeforeCalculate } from '../../../utils/normalizationPersist'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../../utils/fiscalYear'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import { generalLogger } from '../../../utils/logger'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '../../../utils/versionDiffDetection'

interface UseValuationFormSubmissionReturn {
  handleSubmit: (e?: React.FormEvent) => Promise<void>
  isSubmitting: boolean
  validationError: string | null
}

/**
 * Hook for handling form submission
 *
 * Handles:
 * - Form validation (employee count check)
 * - Building ValuationRequest from formData
 * - Calling calculateValuation
 * - Storing result in results store
 * - Creating new version on regeneration (M&A workflow)
 * - Logging to audit trail
 */
export const useValuationFormSubmission = (
  setEmployeeCountError: (error: string | null) => void
): UseValuationFormSubmissionReturn => {
  const t = useTranslations('toast')
  const tReport = useTranslations('report')
  const { formData } = useManualFormStore()
  const { trySetCalculating, setCalculating, isCalculating, setResult } = useManualResultsStore()
  // ROOT CAUSE FIX: Only subscribe to reportId, not entire session object
  // Use resolvedReportId: prefer reportId (UUID), fallback to session_key for pre-first-calc sessions
  const reportId = useSessionStore((state) => {
    const s = state.session
    if (!s) return undefined
    if (s.reportId && s.reportId.length >= 8) return s.reportId
    const sk = (s as any)?.key ?? (s as any)?.session_key
    return sk && typeof sk === 'string' && sk.length >= 8 ? sk : s.reportId
  })
  const sessionName = useSessionStore((state) => state.session?.name) // Get name from session
  const { createVersion, getLatestVersion, fetchVersions } = useVersionHistoryStore()
  const { canSave, reason: canSaveReason } = useCanSave()

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()

      // Defense-in-depth: block submission if auth/bootstrap not ready
      if (!canSave) {
        generalLogger.warn('[Manual] Submission blocked — auth/bootstrap not ready', {
          canSave,
          reason: canSaveReason,
        })
        // Show user-visible feedback so they know why the button did nothing
        const blockedMessage =
          canSaveReason === 'unauthenticated'
            ? t('loginRequired') || 'Please log in before calculating.'
            : canSaveReason === 'bootstrapping'
              ? t('preparingSession') || 'Preparing your session, please wait a moment…'
              : t('notReady') || 'Not ready yet — please wait a moment and try again.'
        toast.warning(blockedMessage)
        return
      }

      try {
        // Log submission
        generalLogger.info('Form onSubmit handler called', {
          hasHandleSubmit: true,
          isSubmitting: false,
        })

        // CRITICAL: Use atomic check-and-set to set loading state IMMEDIATELY
        // This ensures the UI shows loading right away, before any async operations
        // Returns false if already calculating (prevents double submission)
        const wasSet = trySetCalculating()
        if (!wasSet) {
          generalLogger.warn(
            '[Manual] Calculation already in progress, preventing double submission',
            {
              storeState: useManualResultsStore.getState().isCalculating,
              hookValue: isCalculating,
            }
          )
          return // Don't reset - let existing calculation finish
        }

        generalLogger.info('Loading state set to true immediately', {
          wasCalculating: false,
        })

        // Log that we're proceeding with calculation
        generalLogger.info('Form submit triggered', {
          isCalculating: true,
          hasFormData: !!formData,
          formDataKeys: Object.keys(formData || {}),
          revenue: formData?.revenue,
          ebitda: formData?.ebitda,
          industry: formData?.industry,
          country_code: formData?.country_code,
          business_type: formData?.business_type,
          number_of_owners: formData?.number_of_owners,
          number_of_employees: formData?.number_of_employees,
        })

        // Validate employee count when owner count is provided
        // NOTE: 0 employees is valid when there are only owner-managers (no other staff)
        if (
          formData.business_type === 'company' &&
          formData.number_of_owners &&
          formData.number_of_owners > 0 &&
          formData.number_of_employees === undefined
        ) {
          const errorMsg =
            'Employee count is required when owner count is provided to calculate owner concentration risk. Enter 0 if there are no employees besides the owner-managers.'
          generalLogger.warn('Form validation failed: employee count required', {
            business_type: formData.business_type,
            number_of_owners: formData.number_of_owners,
            number_of_employees: formData.number_of_employees,
          })
          setEmployeeCountError(errorMsg)
          setCalculating(false) // Reset loading state on validation error
          return
        }

        // Clear validation error
        setEmployeeCountError(null)

        // Validate required fields.
        // Use explicit null/undefined checks for numeric fields (revenue, ebitda) so that
        // legitimate zero values (pre-revenue startups, break-even businesses) are not
        // incorrectly rejected by a falsy check.
        if (
          formData.revenue == null ||
          formData.ebitda == null ||
          !formData.industry ||
          !formData.country_code ||
          !formData.business_type_id
        ) {
          const missingFields = []
          if (formData.revenue == null) missingFields.push('revenue')
          if (formData.ebitda == null) missingFields.push('ebitda')
          if (!formData.industry) missingFields.push('industry')
          if (!formData.country_code) missingFields.push('country_code')
          if (!formData.business_type_id) missingFields.push('business_type_id')

          generalLogger.warn('Form validation failed: missing required fields', {
            missingFields,
            formDataKeys: Object.keys(formData),
          })
          setEmployeeCountError(`Please fill in all required fields: ${missingFields.join(', ')}`)
          setCalculating(false) // Reset loading state on validation error
          return
        }

        generalLogger.info('Form validation passed, proceeding with calculation', {
          revenue: formData.revenue,
          ebitda: formData.ebitda,
          industry: formData.industry,
          country_code: formData.country_code,
        })

        // CRITICAL: Sync all form data to session IMMEDIATELY before calculation
        // This ensures all data is saved even if calculation fails or user navigates away
        // NOTE: We use fire-and-forget to avoid blocking calculation if backend is slow
        if (reportId) {
          try {
            const currentYear = normalizeCurrentYearForFiling(
              formData.current_year_data?.year,
              Boolean(formData.filing_year_confirmed)
            )
            const normalizedHistoricalYears = normalizeHistoricalYearsForFiling(
              formData.historical_years_data,
              Boolean(formData.filing_year_confirmed)
            )
            // Convert formData to session format
            const sessionUpdate: Partial<any> = {
              company_name: formData.company_name,
              country_code: formData.country_code,
              industry: formData.industry,
              business_model: formData.business_model,
              founding_year: formData.founding_year,
              current_year_data: {
                year: currentYear,
                revenue: formData.revenue ?? formData.current_year_data?.revenue ?? 0,
                ebitda: formData.ebitda ?? formData.current_year_data?.ebitda ?? 0,
                ...(formData.current_year_data?.total_assets != null && {
                  total_assets: formData.current_year_data.total_assets,
                }),
                ...(formData.current_year_data?.total_debt != null && {
                  total_debt: formData.current_year_data.total_debt,
                }),
                ...(formData.current_year_data?.cash != null && {
                  cash: formData.current_year_data.cash,
                }),
              },
              historical_years_data: normalizedHistoricalYears,
              number_of_employees: formData.number_of_employees,
              number_of_owners: formData.number_of_owners,
              recurring_revenue_percentage: formData.recurring_revenue_percentage,
              comparables: formData.comparables,
              business_type_id: formData.business_type_id,
              business_type: formData.business_type,
              shares_for_sale: 100,
              business_context: formData.business_context,
            }

            // Fire-and-forget: Don't await to avoid blocking calculation
            // The sync will happen in the background, and data will be saved after calculation anyway
            sessionService.saveSession(reportId, sessionUpdate).catch((syncError) => {
              generalLogger.warn(
                '[Manual] Background sync failed before calculation, continuing anyway',
                {
                  error: syncError instanceof Error ? syncError.message : String(syncError),
                  reportId,
                }
              )
            })

            generalLogger.info(
              '[Manual] Form data sync initiated (non-blocking) before calculation',
              {
                reportId,
              }
            )
          } catch (syncError) {
            generalLogger.warn(
              '[Manual] Failed to initiate sync before calculation, continuing anyway',
              {
                error: syncError instanceof Error ? syncError.message : String(syncError),
              }
            )
            // Continue with calculation even if sync fails - data will be saved after calculation
          }
        }

        // Build ValuationRequest using unified function
        const request = buildValuationRequest(formData)

        // Explicitly set dataSource for manual flow
        // This ensures backend knows this is a manual (FREE) calculation
        ;(request as any).dataSource = 'manual'

        const calculationRequestIdentifiers = {
          reportId:
            reportId && (isUuid(reportId) || isSessionKey(reportId)) ? reportId : undefined,
          sessionKey: reportId && isSessionKey(reportId) ? reportId : undefined,
        }

        // Preserve the report/session identifier contract used by the manual flow.
        if (calculationRequestIdentifiers.reportId) {
          ;(request as any).reportId = calculationRequestIdentifiers.reportId
        }
        if (calculationRequestIdentifiers.sessionKey) {
          ;(request as any).sessionKey = calculationRequestIdentifiers.sessionKey
        }

        // M&A Workflow: Check if this is a regeneration
        let previousVersion: any = null
        let changes: any = null

        if (reportId) {
          previousVersion = getLatestVersion(reportId)
          if (previousVersion) {
            // Detect changes from previous version
            changes = detectVersionChanges(previousVersion.formData, request)

            generalLogger.info('Regeneration detected', {
              reportId,
              previousVersion: previousVersion.versionNumber,
              totalChanges: changes.totalChanges,
              significantChanges: changes.significantChanges,
            })
          }
        }

        // Persist all normalizations to Titan BEFORE calculation (UX-critical)
        if (reportId) {
          const persistOk = await persistNormalizationsBeforeCalculate(reportId, request as any)
          if (!persistOk) {
            setCalculating(false)
            generalLogger.warn('[ValuationForm] Pre-calculate normalization persist failed')
            toast.error(t('persistFailed'), {
              description: t('persistFailedDesc'),
              action: {
                label: t('retry'),
                onClick: () => handleSubmit(),
              },
            })
            return
          }
        }

        let result
        const calculationStart = performance.now()
        trackValuationCalculate(!!previousVersion)
        try {
          generalLogger.info('[Manual] Calling valuation service', {
            requestKeys: Object.keys(request),
            hasRevenue: !!request.current_year_data?.revenue,
            hasEbitda: !!request.current_year_data?.ebitda,
            industry: request.industry,
            country_code: request.country_code,
          })
          result = await valuationService.calculateValuation(request)

          if (!result) {
            generalLogger.warn('[Manual] Valuation service returned null unexpectedly')
            setCalculating(false)
            toast.error(t('calculationFailed') || 'Calculation failed — please try again.')
            return
          }

          generalLogger.info('[Manual] Valuation calculation completed', {
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : [],
          })

          // Reset calculating state on success
          setCalculating(false)
        } catch (calcError) {
          generalLogger.error('[Manual] Valuation calculation failed', {
            error: calcError instanceof Error ? calcError.message : String(calcError),
            stack: calcError instanceof Error ? calcError.stack : undefined,
            requestKeys: Object.keys(request),
          })
          // Ensure calculating state is reset on error
          setCalculating(false)
          // Re-throw to be caught by outer try-catch
          throw calcError
        }
        const calculationDuration = performance.now() - calculationStart
        if (result && reportId)
          trackValuationResult(calculationDuration, reportId, !!previousVersion)

        if (result) {
          // CRITICAL: Log html_report presence before storing
          generalLogger.info('Valuation calculation completed - checking html_report', {
            valuationId: result.valuation_id,
            hasHtmlReport: !!result.html_report,
            htmlReportLength: result.html_report?.length || 0,
            resultKeys: Object.keys(result),
            htmlReportPreview: result.html_report?.substring(0, 200) || 'N/A',
            calculationDuration: `${calculationDuration.toFixed(2)}ms`,
          })

          // Use structured logger instead of console.log to avoid "Object" spam
          generalLogger.debug('Before setResult: checking html_report', {
            hasHtmlReport: !!result.html_report,
            htmlReportLength: result.html_report?.length || 0,
            resultKeys: Object.keys(result).join(','),
          })

          // Warn if html_report is missing
          if (!result.html_report || result.html_report.trim().length === 0) {
            generalLogger.error('CRITICAL: html_report missing or empty in valuation result', {
              valuationId: result.valuation_id,
              hasHtmlReport: !!result.html_report,
              htmlReportLength: result.html_report?.length || 0,
              resultKeys: Object.keys(result),
              resultType: typeof result,
              resultStringified: JSON.stringify(result).substring(0, 500),
            })
          }

          // Store result in results store
          setResult(result)

          // M&A Workflow: Create version for first calculation or regeneration
          // FIX: Sync from backend first - Titan may have created V1 during calculate (avoids V1/V2 race)
          if (reportId) {
            try {
              await fetchVersions(reportId)
              const latestAfterSync = getLatestVersion(reportId)
              const effectivePrevious = latestAfterSync ?? previousVersion
              const effectiveChanges = effectivePrevious
                ? detectVersionChanges(effectivePrevious.formData, request)
                : null

              if (
                effectivePrevious &&
                effectiveChanges &&
                areChangesSignificant(effectiveChanges)
              ) {
                // Regeneration - create new version with changes
                const newVersion = await createVersion({
                  reportId,
                  formData: request,
                  valuationResult: result,
                  htmlReport: result.html_report || undefined,
                  changesSummary: effectiveChanges,
                  versionLabel: generateAutoLabel(
                    effectivePrevious.versionNumber + 1,
                    effectiveChanges
                  ),
                })

                generalLogger.info('New version created on regeneration', {
                  reportId,
                  versionNumber: newVersion.versionNumber,
                  versionLabel: newVersion.versionLabel,
                })

                // Snapshot draft normalizations to this version
                await snapshotNormalizationsToVersion(reportId, newVersion.id)

                // Log regeneration to audit trail
                valuationAuditService.logRegeneration(
                  reportId,
                  newVersion.versionNumber,
                  effectiveChanges,
                  calculationDuration
                )

                // ✅ FIX: Don't refetch versions immediately - version is already in local state
                // Versions will be synced when version history panel opens or on next mount
              } else if (!effectivePrevious) {
                // First calculation - create initial version
                const firstVersion = await createVersion({
                  reportId,
                  formData: request,
                  valuationResult: result,
                  htmlReport: result.html_report || undefined,
                  changesSummary: { totalChanges: 0, significantChanges: [] },
                  versionLabel: 'v1 - Initial valuation',
                })

                generalLogger.info('Initial version created on first calculation', {
                  reportId,
                  versionNumber: firstVersion.versionNumber,
                  versionLabel: firstVersion.versionLabel,
                })

                // Snapshot draft normalizations to this version
                await snapshotNormalizationsToVersion(reportId, firstVersion.id)

                // ✅ FIX: Don't refetch versions immediately - version is already in local state
                // Versions will be synced when version history panel opens or on next mount
              }
            } catch (versionError) {
              // Don't fail the valuation if versioning fails, but surface error to user
              const errMsg =
                versionError instanceof Error ? versionError.message : String(versionError)
              if (versionError instanceof Error) {
                generalLogger.error('Failed to create version', {
                  reportId,
                  error: versionError.message,
                  stack: versionError.stack,
                  isFirstVersion: !previousVersion,
                })
              } else {
                generalLogger.error('Failed to create version', {
                  reportId,
                  error: String(versionError),
                  isFirstVersion: !previousVersion,
                })
              }
              toast.error(t('versionCreateFailed'), { description: errMsg })
            }
          }

          // CRITICAL: Save complete session atomically (form data + results + HTML reports)
          // This ensures everything can be restored when user returns later
          // Note: Saving handled by unified session store

          if (reportId) {
            try {
              generalLogger.debug('[Manual] Saving report assets', { reportId })

              // ATOMIC SAVE: Save complete package in single API call
              // - sessionData: Original form inputs for restoration
              // - valuationResult: Calculation result
              // - htmlReport: Main report HTML
              // - name: Custom valuation name (e.g., "Amadeus report")
              await reportService.saveReportAssets(reportId, {
                sessionData: formData, // ✅ NEW: Include input data
                valuationResult: result,
                htmlReport: result.html_report,
                name: sessionName, // ✅ NEW: Include custom valuation name
              })

              generalLogger.info(
                '[Manual] Complete report package saved atomically after calculation',
                {
                  reportId,
                  hasSessionData: !!formData,
                  sessionDataKeys: formData ? Object.keys(formData) : [],
                  hasResult: !!result,
                  hasHtmlReport: !!result.html_report,
                  htmlReportLength: result.html_report?.length || 0,
                }
              )

              useSessionStore.getState().markSaved()
            } catch (saveError) {
              const errMsg =
                saveError instanceof Error ? saveError.message : String(saveError)
              generalLogger.error('[Manual] Failed to save complete report package', {
                reportId,
                error: errMsg,
              })
              toast.error(tReport('saveReportFailed'), { description: errMsg })
            }
          } else {
            generalLogger.debug('[Manual] No reportId, skipping save')
            useSessionStore.getState().markSaved()
          }

          generalLogger.info('Valuation calculated successfully', {
            valuationId: result.valuation_id,
            calculationDuration_ms: calculationDuration.toFixed(2),
          })
        } else {
          generalLogger.warn('Valuation calculation returned no result', {
            calculationDuration_ms: calculationDuration.toFixed(2),
          })
        }
      } catch (error) {
        generalLogger.error('Form submission failed', { error })

        // Determine a user-friendly message — never expose raw stack traces or
        // "check the console" instructions to clients during demos or onboarding.
        const rawMsg = error instanceof Error ? error.message : String(error)
        const isNetworkError =
          rawMsg.toLowerCase().includes('network') ||
          rawMsg.toLowerCase().includes('unavailable') ||
          rawMsg.toLowerCase().includes('timeout')
        const isValidationError = error instanceof ValidationError
        const userMessage = isNetworkError
          ? 'The valuation service is temporarily unavailable. Please try again in a moment.'
          : isValidationError
            ? rawMsg
          : 'The valuation could not be completed. Please review your inputs and try again.'

        toast.error(userMessage, { duration: 6000 })
        setEmployeeCountError(isValidationError ? rawMsg : null)
        // CRITICAL: Reset isCalculating on error
        setCalculating(false)
      }
      // NOTE: calculateValuation handles resetting isCalculating on success,
      // but we ensure it's reset on error in the catch block above
    },
    [
      formData,
      setResult,
      setEmployeeCountError,
      reportId,
      sessionName,
      getLatestVersion,
      createVersion,
      fetchVersions,
      setCalculating,
      trySetCalculating,
      isCalculating,
      canSave,
      canSaveReason,
      t,
      tReport,
    ]
  )

  return {
    handleSubmit,
    isSubmitting: isCalculating,
    validationError: null, // Validation errors are handled via setEmployeeCountError
  }
}
