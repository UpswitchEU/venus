import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { NormalizationItem, RightPanelView } from '../../../components/calculator'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { ValuationFormData, ValuationResponse } from '../../../types/valuation'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { pendingReportAssetSave } from '../../../services/report/ReportAssetService'
import { reportAccessScope, watchReportAccessScope } from '../../../utils/reportAccessScope'
import { generalLogger } from '../../../utils/logger'
import {
  buildManualVersionRestorePlan,
  type ManualVersionRestorePlan,
} from '../utils/manualVersionRestorePlan'

interface ManualVersionRestoreNormalizationActions {
  setItems: (items: NormalizationItem[]) => void
}

type ManualVersionRestoreTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string

export interface UseManualVersionRestoreActionParams {
  normalizationActions: ManualVersionRestoreNormalizationActions
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
  reportId,
  resolvedReportId,
  setResult,
  setRightPanelView,
  translate,
  updateFormData,
}: UseManualVersionRestoreActionParams): UseManualVersionRestoreActionResult {
  const pendingRef = useRef<{ target: string; promise: Promise<void> } | null>(null)
  const attemptRef = useRef<{ key: string; id: string } | null>(null)
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
  const handleVersionRestore = useCallback(
    (version: unknown) => {
      if (pendingRef.current?.target === targetRef.current) return pendingRef.current.promise
      const plan = buildManualVersionRestorePlan(version)
      const idForApi = resolvedReportId || reportId
      if (!plan?.versionNumber || !idForApi) return Promise.resolve()
      const access = watchReportAccessScope()
      const revision = revisionRef.current
      const stillCurrent = () => access.isCurrent() && revisionRef.current === revision
      const key = `${reportAccessScope()}:${idForApi}:${plan.versionNumber}`
      if (attemptRef.current?.key !== key) attemptRef.current = { key, id: crypto.randomUUID() }
      const attempt = attemptRef.current
      const initialForm = useManualFormStore.getState().formData
      const operation = (async () => {
        try {
          // An earlier result write must finish before restoration can commit.
          await pendingReportAssetSave(idForApi)
          if (!stillCurrent()) return
          const { VersionAPI } = await import('../../../services/api/version/VersionAPI')
          if (!stillCurrent()) return
          const restored = await new VersionAPI().restoreVersion(idForApi, plan.versionNumber!, {
            idempotencyKey: attempt.id,
            timeout: 30_000,
          })
          if (!restored) throw new Error('Version restoration was not confirmed')
          if (!stillCurrent()) return
          attemptRef.current = null
          const committedPlan = buildManualVersionRestorePlan(restored) ?? plan
          // Preserve edits made while the restore request was in flight.
          if (useManualFormStore.getState().formData === initialForm && committedPlan.formData) {
            updateFormData(committedPlan.formData as Partial<ValuationFormData>)
            normalizationActions.setItems(committedPlan.normalizations)
            restoreTaxLatencySnapshot(committedPlan)
          }
          if (committedPlan.valuationResult) setResult(committedPlan.valuationResult)
          useVersionHistoryStore.getState().setActiveVersion(idForApi, restored.versionNumber)
          setRightPanelView('preview')
          toast.success(translate('versionRestored', { version: restored.versionNumber }))
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
      pendingRef.current = { target: targetRef.current, promise: operation }
      void operation.finally(() => {
        if (pendingRef.current?.promise === operation) pendingRef.current = null
      })
      return operation
    },
    [
      normalizationActions,
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
