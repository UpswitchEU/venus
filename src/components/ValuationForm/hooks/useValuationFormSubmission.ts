/**
 * useValuationFormSubmission Hook
 *
 * Single Responsibility: Form submission logic and validation
 * Extracted from ValuationForm to follow SRP
 *
 * @module components/ValuationForm/hooks/useValuationFormSubmission
 */

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { trackValuationCalculate, trackValuationResult } from '@/lib/analytics'
import {
  buildManualCalculationRequest,
  type ManualCalculationRequest,
} from '../../../features/manual/utils/manualValuationRequest'
import { isSessionPoolPressureCircuitOpen } from '../../../hooks/sessionPoolPressureCircuit'
import { useCanSave } from '../../../hooks/useCanSave'
import { reportService, sessionService, valuationService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { ValidationError } from '../../../types/errors'
import type { ValuationVersion, VersionChanges } from '../../../types/ValuationVersion'
import { generalLogger } from '../../../utils/logger'
import { persistNormalizationsBeforeCalculate } from '../../../utils/normalizationPersist'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import { getRenderableReportHtml } from '../../../utils/safetyNetReportHtml'
import { toastSaveFailure } from '../../../utils/saveErrorHandling'
import { mergeSessionDataForReportAssets } from '../../../utils/sessionPackageHelpers'
import {
  areChangesSignificant,
  detectVersionChanges,
  generateAutoLabel,
} from '../../../utils/versionDiffDetection'
import {
  buildCalculationRequestIdentifiers,
  buildPreCalculationSessionUpdate,
  validateValuationFormSubmission,
} from './ValuationFormSubmissionModel'

interface UseValuationFormSubmissionReturn {
  handleSubmit: (e?: React.FormEvent) => Promise<void>
  isSubmitting: boolean
  validationError: string | null
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const recordValue = (value as Record<string, unknown>)[key]
  return typeof recordValue === 'string' ? recordValue : undefined
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
    const sk = getStringProperty(s, 'key') ?? getStringProperty(s, 'session_key')
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

        const validation = validateValuationFormSubmission(formData)
        if (!validation.ok) {
          if (validation.reason === 'employee_count_required') {
            generalLogger.warn('Form validation failed: employee count required', {
              business_type: formData.business_type,
              number_of_owners: formData.number_of_owners,
              number_of_employees: formData.number_of_employees,
            })
          } else if (validation.reason === 'missing_required_fields') {
            generalLogger.warn('Form validation failed: missing required fields', {
              missingFields: validation.missingFields,
              formDataKeys: Object.keys(formData),
            })
          }
          setEmployeeCountError(validation.message)
          setCalculating(false)
          return
        }

        // Clear validation error
        setEmployeeCountError(null)

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
            const sessionUpdate = buildPreCalculationSessionUpdate(formData)

            // Fire-and-forget: Don't await to avoid blocking calculation
            // Skip during pool-pressure cooldown to avoid amplifying DB checkout storms.
            if (!isSessionPoolPressureCircuitOpen()) {
              sessionService.saveSession(reportId, sessionUpdate).catch((syncError) => {
                generalLogger.warn(
                  '[Manual] Background sync failed before calculation, continuing anyway',
                  {
                    error: syncError instanceof Error ? syncError.message : String(syncError),
                    reportId,
                  }
                )
              })
            } else {
              generalLogger.info(
                '[Manual] Skipping pre-calculation sync while session pool-pressure circuit is open',
                { reportId }
              )
            }

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

        const calculationRequestIdentifiers = buildCalculationRequestIdentifiers(reportId)

        const methodSnap = useManualResultsStore.getState()
        const request: ManualCalculationRequest = buildManualCalculationRequest({
          formData,
          selectedMethod: methodSnap.preSelectedMethod ?? methodSnap.selectedMethod,
          identifiers: calculationRequestIdentifiers,
          synthesisSelection: {
            preSelectedMethods: methodSnap.preSelectedMethods,
            userWeights: methodSnap.userWeights,
            userWeightJustification: methodSnap.userWeightJustification,
          },
        })

        // M&A Workflow: Check if this is a regeneration
        let previousVersion: ValuationVersion | null = null
        let changes: VersionChanges | null = null

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
          const persistOk = await persistNormalizationsBeforeCalculate(reportId, request)
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
            hasRevenue: request.current_year_data?.revenue != null,
            hasEbitda: request.current_year_data?.ebitda != null,
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

          const renderableHtmlReport = getRenderableReportHtml(result.html_report)

          // Warn if renderable html_report is missing
          if (!renderableHtmlReport) {
            generalLogger.error(
              'CRITICAL: renderable html_report missing or empty in valuation result',
              {
                valuationId: result.valuation_id,
                hasHtmlReport: !!result.html_report,
                htmlReportLength: result.html_report?.length || 0,
                resultKeys: Object.keys(result),
                resultType: typeof result,
                resultStringified: JSON.stringify(result).substring(0, 500),
              }
            )
          }

          // Store result in results store
          setResult(result)

          let durableSaveSucceeded = !reportId

          // CRITICAL: Save complete session atomically (form data + results + HTML reports)
          // This is the durable first-paint path; defer version sync until it succeeds.
          if (reportId) {
            const saveStartDirtyVersion = useSessionStore.getState().dirtyVersion
            try {
              generalLogger.debug('[Manual] Saving report assets', { reportId })

              await reportService.saveReportAssets(reportId, {
                sessionData: mergeSessionDataForReportAssets(
                  formData as unknown as Record<string, unknown>,
                  request as unknown as Record<string, unknown>,
                  useTaxLatencyStore.getState().items
                ),
                valuationResult: result,
                htmlReport: renderableHtmlReport,
                name: sessionName,
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

              useSessionStore.getState().markSaved(saveStartDirtyVersion)
              durableSaveSucceeded = true
            } catch (saveError) {
              generalLogger.error('[Manual] Failed to save complete report package', {
                reportId,
                error: saveError instanceof Error ? saveError.message : String(saveError),
              })
              toastSaveFailure(saveError, tReport)
            }
          } else {
            generalLogger.debug('[Manual] No reportId, skipping save')
            useSessionStore.getState().markSaved(useSessionStore.getState().dirtyVersion)
          }

          // M&A Workflow: Create version for first calculation or regeneration
          // FIX: Sync from backend first - Titan may have created V1 during calculate (avoids V1/V2 race)
          if (reportId && durableSaveSucceeded) {
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
                  htmlReport: renderableHtmlReport,
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
                  htmlReport: renderableHtmlReport,
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
          } else if (reportId) {
            generalLogger.warn('[Manual] Skipping version sync until durable asset save succeeds', {
              reportId,
            })
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
          ? t('serviceUnavailable')
          : isValidationError
            ? rawMsg
            : t('calculationFailedReview')

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
