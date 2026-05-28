import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import { reportService } from '../../../services'
import { valuationAuditService } from '../../../services/audit/ValuationAuditService'
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
  translateHistory: ManualCalculationHistoryTranslator
  translateReport: ManualCalculationReportTranslator
  userId?: string
  versionSyncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
}

export interface UseManualCalculationCompletionResult {
  completeManualCalculation: (
    params: CompleteManualCalculationParams
  ) => Promise<CompleteManualCalculationResult>
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
  translateHistory,
  translateReport,
  userId,
  versionSyncTimeoutRef,
}: UseManualCalculationCompletionParams): UseManualCalculationCompletionResult {
  const completeManualCalculation = useCallback(
    async ({
      calculationDurationMs,
      idForApi,
      previousVersion,
      request,
      retrySubmit,
      storeSnapshot,
      submitRun,
      valuationResult,
    }: CompleteManualCalculationParams): Promise<CompleteManualCalculationResult> => {
      const willPersist = Boolean(idForApi)
      if (willPersist) {
        durableSaveInFlightRef.current = true
        setDraftStatus('saving')
      }

      setResult(valuationResult)
      submitRun.endLoading()
      lastSubmittedFinancialSnapshotRef.current = buildSubmittedFinancialSnapshot(request)

      const saveResult = await saveManualCalculationReportAssets({
        reportId: idForApi,
        sessionData: storeSnapshot as unknown as Record<string, unknown>,
        request: request as unknown as Record<string, unknown>,
        taxLatencyItems: useTaxLatencyStore.getState().items,
        valuationResult,
        name: sessionName,
        dirtyVersion: useSessionStore.getState().dirtyVersion,
        isStillTarget: submitRun.isStillTarget,
        deps: {
          saveReportAssets: (reportId, assets) => reportService.saveReportAssets(reportId, assets),
          markSaved: (dirtyVersion) => useSessionStore.getState().markSaved(dirtyVersion),
        },
      })

      if (saveResult.aborted) {
        if (willPersist) durableSaveInFlightRef.current = false
        return { aborted: true, versionCreationFailed: false }
      }

      if (saveResult.saveError) {
        generalLogger.error('[ManualLayout] Failed to save report assets', {
          reportId: idForApi,
          error:
            saveResult.saveError instanceof Error
              ? saveResult.saveError.message
              : String(saveResult.saveError),
        })
        toastSaveFailure(saveResult.saveError, translateReport)
      }

      if (saveResult.durableSaveSucceeded) {
        setDraftStatus('saved')
        setLastSaved(new Date())
        setIsDirty(false)
      } else if (!saveResult.aborted && willPersist) {
        setDraftStatus('draft')
      }

      if (willPersist) {
        durableSaveInFlightRef.current = false
      }

      const versionCreationFailed = await completeManualVersioning({
        calculationDurationMs,
        createVersion,
        durableSaveSucceeded: saveResult.durableSaveSucceeded,
        idForApi,
        previousVersion,
        request,
        retrySubmit,
        submitRun,
        translate,
        translateHistory,
        userId,
        valuationResult,
        versionSyncTimeoutRef,
      })

      if (versionCreationFailed.aborted) return versionCreationFailed

      if (saveResult.durableSaveSucceeded && !versionCreationFailed.versionCreationFailed) {
        if (!submitRun.isStillTarget()) return { aborted: true, versionCreationFailed: false }
        toast.success(translate('calculationComplete'))
        if (postValuationListingHandoffPendingRef.current) {
          postValuationListingHandoffPendingRef.current = false
          if (isAccountantMode) {
            setPendingPostValuationAgentPrompt(MANUAL_AGENT_NEXT_PREPARE_LISTING_PROMPT)
          }
        }
      }

      return versionCreationFailed
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
      translateHistory,
      translateReport,
      userId,
      versionSyncTimeoutRef,
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
  retrySubmit,
  submitRun,
  translate,
  translateHistory,
  userId,
  valuationResult,
  versionSyncTimeoutRef,
}: {
  calculationDurationMs: number
  createVersion: (request: CreateVersionRequest) => Promise<ValuationVersion>
  durableSaveSucceeded: boolean
  idForApi?: string | null
  previousVersion: ManualVersionBaseline | null
  request: ValuationRequest
  retrySubmit: () => void
  submitRun: ManualSubmitRun
  translate: ManualCalculationCompletionTranslator
  translateHistory: ManualCalculationHistoryTranslator
  userId?: string
  valuationResult: ValuationResponse
  versionSyncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
}): Promise<CompleteManualCalculationResult> {
  if (!idForApi) return { aborted: false, versionCreationFailed: false }

  if (!durableSaveSucceeded) {
    generalLogger.warn('[ManualLayout] Skipping version sync until report save succeeds', {
      reportId: idForApi,
    })
    return { aborted: false, versionCreationFailed: false }
  }

  const versioningResult = await runManualCalculationVersioning({
    reportId: idForApi,
    previousVersion,
    request,
    valuationResult,
    calculationDurationMs,
    userId,
    isStillTarget: submitRun.isStillTarget,
    deps: {
      fetchVersions: (reportId) => useVersionHistoryStore.getState().fetchVersions(reportId),
      getLatestVersion: (reportId) => useVersionHistoryStore.getState().getLatestVersion(reportId),
      createVersion,
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
    generalLogger.warn('[ManualLayout] fetchVersions failed', {
      reportId: idForApi,
      error: fetchMsg,
    })
    toast.warning(translateHistory('loadError'), { description: fetchMsg })
  }

  if (versioningResult.versionError) {
    const errMsg =
      versioningResult.versionError instanceof Error
        ? versioningResult.versionError.message
        : String(versioningResult.versionError)
    generalLogger.error('Failed to create version', { reportId: idForApi, error: errMsg })
    toast.error(translate('versionCreateFailed'), {
      description: errMsg,
      action: {
        label: translate('retry'),
        onClick: retrySubmit,
      },
    })
  }

  scheduleManualVersionHistorySync({
    timeoutRef: versionSyncTimeoutRef,
    reportId: idForApi,
    fetchVersions: (reportId) => useVersionHistoryStore.getState().fetchVersions(reportId),
    isStillTarget: submitRun.isStillTarget,
    onError: (err) => {
      generalLogger.warn('[ManualLayout] Version history sync failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      toast.warning(translateHistory('loadError'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  return {
    aborted: false,
    versionCreationFailed: versioningResult.versionCreationFailed,
  }
}
