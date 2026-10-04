import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { toast } from 'sonner'
import type { NormalizationItem, RightPanelView } from '../../../components/calculator'
import { pendingReportAssetSave } from '../../../services/report/ReportAssetService'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../../store/manual/useManualResultsStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { ValuationFormData, ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { reportAccessScope, watchReportAccessScope } from '../../../utils/reportAccessScope'
import {
  buildManualVersionRestorePlan,
  type ManualVersionRestorePlan,
} from '../utils/manualVersionRestorePlan'

import { persistManualVersionRestoreEdits } from '../utils/persistManualVersionRestoreEdits'

interface ManualVersionRestoreNormalizationActions {
  setItems: (items: NormalizationItem[]) => void
}

type ManualVersionRestoreTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string

export interface UseManualVersionRestoreActionParams {
  normalizationActions: ManualVersionRestoreNormalizationActions
  restoreInFlightRef: MutableRefObject<boolean>
  flushFormAfterRestore: () => Promise<void>
  reportId: string
  resolvedReportId?: string | null
  setResult: (result: ValuationResponse | null) => void
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>
  translate: ManualVersionRestoreTranslator
  updateFormData: (patch: Partial<ValuationFormData>) => void
}

export interface UseManualVersionRestoreActionResult {
  handleVersionRestore: (version: unknown) => Promise<void>
}

export function useManualVersionRestoreAction({
  normalizationActions,
  restoreInFlightRef,
  flushFormAfterRestore,
  reportId,
  resolvedReportId,
  setResult,
  setRightPanelView,
  translate,
  updateFormData,
}: UseManualVersionRestoreActionParams): UseManualVersionRestoreActionResult {
  const pendingRef = useRef<{
    target: string
    versionNumber: number
    promise: Promise<void>
  } | null>(null)
  const attemptRef = useRef<{ key: string; id: string } | null>(null)
  const noticeRef = useRef<string | null>(null)
  const targetRef = useRef('')
  const revisionRef = useRef(0)
  const target = `${reportAccessScope()}:${resolvedReportId || reportId}`
  if (targetRef.current !== target) {
    targetRef.current = target
    revisionRef.current += 1
  }
  useEffect(
    () => () => {
      revisionRef.current += 1
    },
    []
  )
  const noticeTargetRef = useRef(target)
  useEffect(() => {
    if (noticeTargetRef.current !== target && noticeRef.current) {
      toast.dismiss(noticeRef.current)
      noticeRef.current = null
    }
    noticeTargetRef.current = target
  }, [target])
  useEffect(
    () => () => {
      if (noticeRef.current) toast.dismiss(noticeRef.current)
    },
    []
  )
  const handleVersionRestore = useCallback(
    (version: unknown) => {
      const plan = buildManualVersionRestorePlan(version)
      const idForApi = resolvedReportId || reportId
      if (!plan?.versionNumber || !idForApi) return Promise.resolve()
      const versionNumber = plan.versionNumber
      // A second restore would race the first server commit. Coalesce an
      // identical request; keep a different selection available after it settles.
      if (pendingRef.current?.target === targetRef.current) {
        if (pendingRef.current.versionNumber === versionNumber) return pendingRef.current.promise
        toast.info(translate('versionRestoreInProgress'))
        return Promise.resolve()
      }
      if (restoreInFlightRef.current) {
        toast.info(translate('versionRestoreInProgress'))
        return Promise.resolve()
      }
      if (noticeRef.current) toast.dismiss(noticeRef.current)
      const access = watchReportAccessScope()
      const revision = ++revisionRef.current
      const engine = useSessionStore.getState().engine
      const engineRevision = useSessionStore.getState().engineRevision
      const stillCurrent = () =>
        access.isCurrent() &&
        revisionRef.current === revision &&
        useSessionStore.getState().engine === engine &&
        useSessionStore.getState().engineRevision === engineRevision
      const key = `${reportAccessScope()}:${idForApi}:${plan.versionNumber}`
      if (attemptRef.current?.key !== key) attemptRef.current = { key, id: crypto.randomUUID() }
      const attempt = attemptRef.current
      const initialForm = useManualFormStore.getState().formData
      const initialNormalizations = useNormalizationStore.getState().items
      const initialTaxItems = useTaxLatencyStore.getState().items
      const initialTaxCandidates = useTaxLatencyStore.getState().candidates
      restoreInFlightRef.current = true
      const operation = (async () => {
        try {
          // An earlier result write must finish before restoration can commit.
          await pendingReportAssetSave(idForApi)
          if (!stillCurrent()) return
          const { VersionAPI } = await import('../../../services/api/version/VersionAPI')
          if (!stillCurrent()) return
          const restored = await new VersionAPI().restoreVersion(idForApi, versionNumber, {
            idempotencyKey: attempt.id,
            timeout: 30_000,
          })
          if (!restored) throw new Error('Version restoration was not confirmed')
          if (!stillCurrent()) return
          const committedPlan = buildManualVersionRestorePlan(restored)
          if (!committedPlan?.versionNumber) throw new Error('Invalid restored version')
          attemptRef.current = null
          // Treat the inputs as one snapshot: changing an adjustment must not
          // replace the form or other adjustments with an older version either.
          const editsUnchanged =
            useManualFormStore.getState().formData === initialForm &&
            useNormalizationStore.getState().items === initialNormalizations &&
            useTaxLatencyStore.getState().items === initialTaxItems &&
            useTaxLatencyStore.getState().candidates === initialTaxCandidates
          if (editsUnchanged && committedPlan.formData) {
            updateFormData(committedPlan.formData as Partial<ValuationFormData>)
            normalizationActions.setItems(committedPlan.normalizations)
            restoreTaxLatencySnapshot(committedPlan)
          }
          if (committedPlan.valuationResult) {
            setResult(committedPlan.valuationResult)
            useManualResultsStore.getState().announceNewResult()
          }
          useVersionHistoryStore.getState().setActiveVersion(idForApi, restored.versionNumber)
          setRightPanelView('preview')
          if (!editsUnchanged) {
            const noticeId = `version-restore-edits-${attempt.id}`
            noticeRef.current = noticeId
            let persisting = false
            const persistEdits = async () => {
              if (!stillCurrent() || persisting) return
              persisting = true
              restoreInFlightRef.current = true
              try {
                await persistManualVersionRestoreEdits({
                  flushForm: flushFormAfterRestore,
                  isCurrent: stillCurrent,
                })
                if (stillCurrent())
                  toast.success(translate('versionRestored', { version: restored.versionNumber }), {
                    id: noticeId,
                    description: translate('versionRestoreEditsKept'),
                  })
              } catch {
                if (stillCurrent())
                  toast.error(translate('versionRestoreEditsSaveFailed'), {
                    id: noticeId,
                    duration: Infinity,
                    action: {
                      label: translate('versionRestoreRetrySave'),
                      onClick: () => {
                        void persistEdits()
                      },
                    },
                  })
              } finally {
                persisting = false
                if (!pendingRef.current || pendingRef.current.promise === operation)
                  restoreInFlightRef.current = false
              }
            }
            await persistEdits()
          } else {
            toast.success(translate('versionRestored', { version: restored.versionNumber }))
          }
          // History refresh cannot turn a committed restoration into a failure.
          void useVersionHistoryStore.getState().fetchVersions(idForApi)
        } catch (error) {
          if (!stillCurrent()) return
          generalLogger.warn('[ManualValuationWorkspace] Version restore failed', {
            error: error instanceof Error ? error.message : String(error),
          })
          toast.error(translate('versionRestoreFailed'))
        } finally {
          access.dispose()
        }
      })()
      pendingRef.current = {
        target: targetRef.current,
        versionNumber: plan.versionNumber,
        promise: operation,
      }
      void operation.finally(() => {
        if (pendingRef.current?.promise === operation) {
          pendingRef.current = null
          restoreInFlightRef.current = false
        }
      })
      return operation
    },
    [
      normalizationActions,
      restoreInFlightRef,
      flushFormAfterRestore,
      reportId,
      resolvedReportId,
      setResult,
      setRightPanelView,
      translate,
      updateFormData,
    ]
  )

  return { handleVersionRestore }
}

function restoreTaxLatencySnapshot(
  restorePlan: Pick<ManualVersionRestorePlan, 'taxLatencyCandidates' | 'taxLatencyItems'>
) {
  const taxLatencyStore = useTaxLatencyStore.getState()

  if (restorePlan.taxLatencyItems.length > 0) {
    taxLatencyStore.setItems(restorePlan.taxLatencyItems, { source: 'system' })
  } else {
    taxLatencyStore.clear({ source: 'system' })
  }

  taxLatencyStore.setCandidates(restorePlan.taxLatencyCandidates)
}
