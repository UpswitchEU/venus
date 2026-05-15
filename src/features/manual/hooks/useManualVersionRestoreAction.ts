import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import type { NormalizationItem, RightPanelView } from '../../../components/calculator'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { ValuationFormData, ValuationResponse } from '../../../types/valuation'
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
  const handleVersionRestore = useCallback(
    async (version: unknown) => {
      try {
        const restorePlan = buildManualVersionRestorePlan(version)
        if (!restorePlan) return

        const { versionNumber } = restorePlan
        const idForApi = resolvedReportId || reportId

        notifyBackendVersionRestore(idForApi, versionNumber)

        if (restorePlan.formData) {
          updateFormData(restorePlan.formData as Partial<ValuationFormData>)
        }

        if (restorePlan.valuationResult) {
          setResult(restorePlan.valuationResult)
        }

        if (restorePlan.normalizations.length > 0) {
          normalizationActions.setItems(restorePlan.normalizations)
        }

        restoreTaxLatencySnapshot(restorePlan)

        if (idForApi && versionNumber) {
          useVersionHistoryStore.getState().setActiveVersion(idForApi, versionNumber)
          await useVersionHistoryStore.getState().fetchVersions(idForApi)
        }

        setRightPanelView('preview')
        toast.success(translate('versionRestored', { version: versionNumber ?? '' }))
      } catch (error) {
        generalLogger.warn('[ManualLayout] Version restore failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(translate('versionRestoreFailed'))
      }
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

function notifyBackendVersionRestore(reportId?: string | null, versionNumber?: number) {
  if (!reportId || !versionNumber) return

  import('../../../services/api/version/VersionAPI')
    .then(({ VersionAPI }) => {
      const api = new VersionAPI()
      api.restoreVersion(reportId, versionNumber).catch(() => {
        generalLogger.warn('[ManualLayout] Backend restore notification failed (non-blocking)')
      })
    })
    .catch((err: unknown) => {
      generalLogger.warn('[ManualLayout] VersionAPI import failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
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
