import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import { MOBILE_VIEWPORT_QUERY } from '../../../hooks/useMobileViewport'
import { reportAssetService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { CreateVersionRequest, ValuationVersion } from '../../../types/ValuationVersion'
import type {
  ValuationFormData,
  ValuationRequest,
  ValuationResponse,
} from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { snapshotNormalizationsToVersion } from '../../../utils/normalizationSnapshot'
import { toastSaveFailure } from '../../../utils/saveErrorHandling'
import { MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT } from '../utils/manualAgentNextHandoff'
import {
  buildSubmittedFinancialSnapshot,
  type SubmittedFinancialSnapshot,
} from '../utils/manualFinancialSnapshot'
import { saveManualCalculationReportAssets } from '../utils/manualReportAssetSave'
import { formKeysChangedSinceSubmit } from '../utils/manualReportAssets'
import {
  applyPostCalculateHtmlRecovery,
  needsManualReportHtmlRecovery,
} from '../utils/manualReportHtmlRecoveryUtil'
import { recordManualValuationSaved } from '../utils/manualValuationSaveReceipt'
import { scheduleManualVersionHistorySync } from '../utils/manualVersionHistorySync'
import type { ManualVersionBaseline } from '../utils/manualVersioningDecision'
import { runManualCalculationVersioning } from '../utils/manualVersioningExecutor'
import type { ManualSubmitRun } from './useManualSubmitRunGuard'

type ManualCalculationCompletionTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string

type ManualCalculationHistoryTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string

type ManualCalculationReportTranslator = (key: string) => string

export interface ManualCalculationCompletionTimeoutRef {
  current: ReturnType<typeof setTimeout> | null
}

export interface CompleteManualCalculationParams {
  calculationDurationMs: number
  idForApi?: string | null
  previousVersion: ManualVersionBaseline | null
  request: ValuationRequest
  retrySubmit: () => void
  storeSnapshot: ValuationFormData
  submitRun: ManualSubmitRun
  valuationResult: ValuationResponse
}

export interface CompleteManualCalculationResult {
  aborted: boolean
  durableSaveSucceeded: boolean
  versionCreationFailed: boolean
}

export interface UseManualCalculationCompletionParams {
  createVersion: (request: CreateVersionRequest) => Promise<ValuationVersion>
  isAccountantMode: boolean
  lastSubmittedFinancialSnapshotRef: MutableRefObject<SubmittedFinancialSnapshot | null>
  postValuationListingHandoffPendingRef: MutableRefObject<boolean>
  sessionName?: string
  durableSaveInFlightRef: MutableRefObject<boolean>
  setDraftStatus: Dispatch<SetStateAction<'draft' | 'saved' | 'saving'>>
  setIsDirty: (isDirty: boolean) => void
  setLastSaved: Dispatch<SetStateAction<Date | undefined>>
  setPendingPostValuationAgentPrompt: Dispatch<SetStateAction<string | null>>
  setResult: (result: ValuationResponse | null) => void
  translate: ManualCalculationCompletionTranslator
  /** No longer read: version-history load failures are logged, not toasted. */
  translateHistory?: ManualCalculationHistoryTranslator
  translateReport: ManualCalculationReportTranslator
  userId?: string
  versionSyncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  startProposalVersionLabelRef: MutableRefObject<string | null>
}

export interface UseManualCalculationCompletionResult {
  completeManualCalculation: (
    params: CompleteManualCalculationParams
  ) => Promise<CompleteManualCalculationResult>
}

/** Phones show the report behind a tab; there the finished run deserves a short toast. */
function isReportPanelHidden(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.(MOBILE_VIEWPORT_QUERY).matches === true
  )
}

export function useManualCalculationCompletion({
  createVersion,
  isAccountantMode,
  lastSubmittedFinancialSnapshotRef,
  postValuationListingHandoffPendingRef,
  sessionName,
  durableSaveInFlightRef,
  setDraftStatus,
  setIsDirty,
  setLastSaved,
  setPendingPostValuationAgentPrompt,
  setResult,
  translate,
  translateReport,
  userId,
  versionSyncTimeoutRef,
  startProposalVersionLabelRef,
}: UseManualCalculationCompletionParams): UseManualCalculationCompletionResult {
  const completeManualCalculation = useCallback(
    async ({
      calculationDurationMs,
      idForApi,
      previousVersion,
      request,
      storeSnapshot,
      submitRun,
      valuationResult,
    }: CompleteManualCalculationParams): Promise<CompleteManualCalculationResult> => {
      const willPersist = Boolean(idForApi)
      // Edits made while the calculation ran must survive its save: Titan merges the saved
      // form over the stored session, so the submit-time copy would overwrite them there.
      const inputsChangedSinceSubmit = () =>
        formKeysChangedSinceSubmit(
          storeSnapshot as unknown as Record<string, unknown>,
          useManualFormStore.getState().formData as unknown as Record<string, unknown>
        )
      const changedFormKeys = inputsChangedSinceSubmit()
      if (changedFormKeys.length > 0) {
        generalLogger.info('[ManualValuationWorkspace] Inputs changed while calculating', {
          reportId: idForApi,
          changedFields: changedFormKeys,
        })
      }
      // The result reflects the submitted inputs, so "inputs changed" only stays armed for
      // edits made while it ran. Later edits re-arm it through the form change handler.
      setIsDirty(changedFormKeys.length > 0)

      if (willPersist) {
        durableSaveInFlightRef.current = true
        setDraftStatus('saving')
      }

      setResult(valuationResult)
      useManualResultsStore.getState().announceNewResult()
      const announcementSeq = useManualResultsStore.getState().resultAnnouncementSeq
      let resultForUi = valuationResult
      submitRun.endLoading()
      lastSubmittedFinancialSnapshotRef.current = buildSubmittedFinancialSnapshot(request)

      const dirtyVersion = useSessionStore.getState().dirtyVersion
      const initialVersionLabel = startProposalVersionLabelRef.current
      const saveResultAssets = (keysToKeepOut: readonly string[]) =>
        saveManualCalculationReportAssets({
          reportId: idForApi,
          sessionData: storeSnapshot as unknown as Record<string, unknown>,
          request: request as unknown as Record<string, unknown>,
          taxLatencyItems: useTaxLatencyStore.getState().items,
          valuationResult,
          name: sessionName,
          dirtyVersion,
          isStillTarget: submitRun.isStillTarget,
          changedFormKeys: keysToKeepOut,
          deps: {
            saveReportAssets: (reportId, assets) =>
              reportAssetService.saveReportAssets(reportId, assets),
            markSaved: (version) => useSessionStore.getState().markSaved(version),
          },
        })
      let durablySaved = false
      const markDurablySaved = () => {
        durablySaved = true
        setDraftStatus('saved')
        setLastSaved(new Date())
        if (idForApi) {
          recordManualValuationSaved([idForApi, useSessionStore.getState().session?.reportId])
        }
      }
      const runVersioning = (
        durableSaveSucceeded: boolean
      ): ReturnType<typeof completeManualVersioning> =>
        completeManualVersioning({
          calculationDurationMs,
          createVersion,
          durableSaveSucceeded,
          idForApi,
          previousVersion,
          request,
          // A failed version write retries the version, never a whole new calculation.
          retryVersion: () => void runVersioning(durableSaveSucceeded),
          submitRun,
          translate,
          userId,
          valuationResult,
          versionSyncTimeoutRef,
          initialVersionLabel,
        })

      // Re-sends this result only while it is still the newest one of this report: a later
      // calculation or a loaded version owns the report and must not be overwritten.
      let retryInFlight = false
      const retryResultSave = async (): Promise<void> => {
        if (retryInFlight || durablySaved || !idForApi) return
        if (!submitRun.isStillTarget()) {
          // A failed first save of a new report replaces the workspace with the
          // session error screen, which unmounts this run: the toast's retry must
          // still re-send the failed payload instead of silently doing nothing.
          if (useManualResultsStore.getState().resultAnnouncementSeq === announcementSeq) {
            await reportAssetService.retryFailedSave(idForApi).catch(() => undefined)
          }
          return
        }
        if (useManualResultsStore.getState().resultAnnouncementSeq !== announcementSeq) return
        retryInFlight = true
        durableSaveInFlightRef.current = true
        setDraftStatus('saving')
        const retryResult = await saveResultAssets(inputsChangedSinceSubmit())
        durableSaveInFlightRef.current = false
        retryInFlight = false
        if (retryResult.aborted) return
        if (!retryResult.durableSaveSucceeded) {
          setDraftStatus('draft')
          toastSaveFailure(retryResult.saveError, translateReport, {
            onRetry: () => void retryResultSave(),
          })
          return
        }
        markDurablySaved()
        toast.success(translateReport('saveRetrySucceeded'))
        await runVersioning(true)
      }

      const saveResult = await saveResultAssets(changedFormKeys)

      if (saveResult.aborted) {
        if (willPersist) durableSaveInFlightRef.current = false
        return { aborted: true, durableSaveSucceeded: false, versionCreationFailed: false }
      }

      if (saveResult.saveError) {
        generalLogger.error('[ManualValuationWorkspace] Failed to save report assets', {
          reportId: idForApi,
          error:
            saveResult.saveError instanceof Error
              ? saveResult.saveError.message
              : String(saveResult.saveError),
        })
        toastSaveFailure(saveResult.saveError, translateReport, {
          onRetry: () => void retryResultSave(),
        })
      }

      if (saveResult.durableSaveSucceeded) {
        markDurablySaved()
      } else if (!saveResult.aborted && willPersist) {
        setDraftStatus('draft')
      }

      if (willPersist) {
        durableSaveInFlightRef.current = false
      }

      const versionCreationFailed = await runVersioning(saveResult.durableSaveSucceeded)

      if (versionCreationFailed.aborted) {
        return {
          ...versionCreationFailed,
          durableSaveSucceeded: saveResult.durableSaveSucceeded,
        }
      }

      if (saveResult.durableSaveSucceeded && idForApi && submitRun.isStillTarget()) {
        resultForUi = await applyPostCalculateHtmlRecovery({
          reportId: idForApi,
          session: useSessionStore.getState().session,
          result: resultForUi,
        })
        if (!submitRun.isStillTarget()) {
          return {
            aborted: true,
            durableSaveSucceeded: saveResult.durableSaveSucceeded,
            versionCreationFailed: false,
          }
        }
      }

      if (saveResult.durableSaveSucceeded && !versionCreationFailed.versionCreationFailed) {
        if (!submitRun.isStillTarget()) {
          return {
            aborted: true,
            durableSaveSucceeded: saveResult.durableSaveSucceeded,
            versionCreationFailed: false,
          }
        }

        const recoveryStillMissing =
          idForApi &&
          needsManualReportHtmlRecovery({
            reportId: idForApi,
            session: useSessionStore.getState().session,
            result: resultForUi,
            standaloneHtmlReport: useManualResultsStore.getState().htmlReport,
          })
        // The report appearing is the confirmation. A still-missing preview explains itself
        // in the report panel (with its own retry), so no toast repeats or contradicts it.
        // Only a phone, where the report sits behind the other tab, gets a short note.
        if (!recoveryStillMissing && isReportPanelHidden()) {
          toast.success(translate('calculationComplete'))
        }
        if (postValuationListingHandoffPendingRef.current) {
          postValuationListingHandoffPendingRef.current = false
          if (isAccountantMode) {
            setPendingPostValuationAgentPrompt(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT)
          }
        }
      }

      return {
        ...versionCreationFailed,
        durableSaveSucceeded: saveResult.durableSaveSucceeded,
      }
    },
    [
      createVersion,
      isAccountantMode,
      lastSubmittedFinancialSnapshotRef,
      postValuationListingHandoffPendingRef,
      sessionName,
      durableSaveInFlightRef,
      setDraftStatus,
      setIsDirty,
      setLastSaved,
      setPendingPostValuationAgentPrompt,
      setResult,
      translate,
      translateReport,
      userId,
      versionSyncTimeoutRef,
      startProposalVersionLabelRef,
    ]
  )

  return { completeManualCalculation }
}

async function completeManualVersioning({
  calculationDurationMs,
  createVersion,
  durableSaveSucceeded,
  idForApi,
  previousVersion,
  request,
  retryVersion,
  submitRun,
  translate,
  userId,
  valuationResult,
  versionSyncTimeoutRef,
  initialVersionLabel,
}: {
  calculationDurationMs: number
  createVersion: (request: CreateVersionRequest) => Promise<ValuationVersion>
  durableSaveSucceeded: boolean
  idForApi?: string | null
  previousVersion: ManualVersionBaseline | null
  request: ValuationRequest
  retryVersion: () => void
  submitRun: ManualSubmitRun
  translate: ManualCalculationCompletionTranslator
  userId?: string
  valuationResult: ValuationResponse
  versionSyncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  initialVersionLabel?: string | null
}): Promise<Omit<CompleteManualCalculationResult, 'durableSaveSucceeded'>> {
  if (!idForApi) return { aborted: false, versionCreationFailed: false }

  if (!durableSaveSucceeded) {
    generalLogger.warn(
      '[ManualValuationWorkspace] Skipping version sync until report save succeeds',
      {
        reportId: idForApi,
      }
    )
    return { aborted: false, versionCreationFailed: false }
  }

  const versioningResult = await runManualCalculationVersioning({
    reportId: idForApi,
    previousVersion,
    request,
    valuationResult,
    calculationDurationMs,
    userId,
    initialVersionLabel: initialVersionLabel ?? undefined,
    isStillTarget: submitRun.isStillTarget,
    deps: {
      fetchVersions: (reportId) => useVersionHistoryStore.getState().fetchVersions(reportId),
      getLatestVersion: (reportId) => useVersionHistoryStore.getState().getLatestVersion(reportId),
      createVersion,
      updateVersion: (reportId, versionNumber, updates) =>
        useVersionHistoryStore.getState().updateVersion(reportId, versionNumber, updates),
      snapshotNormalizationsToVersion,
      logRegeneration: (...args) => valuationAuditService.logRegeneration(...args),
    },
  })

  if (versioningResult.aborted) return { aborted: true, versionCreationFailed: false }

  if (versioningResult.fetchError) {
    const fetchMsg =
      versioningResult.fetchError instanceof Error
        ? versioningResult.fetchError.message
        : String(versioningResult.fetchError)
    // Background read: logged, not toasted. The version menu shows its own load state.
    generalLogger.warn('[ManualValuationWorkspace] fetchVersions failed', {
      reportId: idForApi,
      error: fetchMsg,
    })
  }

  if (versioningResult.versionError) {
    const errMsg =
      versioningResult.versionError instanceof Error
        ? versioningResult.versionError.message
        : String(versioningResult.versionError)
    generalLogger.error('Failed to create version', { reportId: idForApi, error: errMsg })
    toast.error(translate('versionCreateFailed'), {
      action: {
        label: translate('retry'),
        onClick: retryVersion,
      },
    })
  }

  scheduleManualVersionHistorySync({
    timeoutRef: versionSyncTimeoutRef,
    reportId: idForApi,
    fetchVersions: (reportId) => useVersionHistoryStore.getState().fetchVersions(reportId),
    isStillTarget: submitRun.isStillTarget,
    onError: (err) => {
      generalLogger.warn('[ManualValuationWorkspace] Version history sync failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    },
  })

  return {
    aborted: false,
    versionCreationFailed: versioningResult.versionCreationFailed,
  }
}
