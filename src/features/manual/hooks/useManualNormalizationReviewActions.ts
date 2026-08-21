import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import { trackAINormalizationAccept } from '@/lib/analytics'
import type { NormalizationItem, SuggestedNormalisation } from '../../../components/calculator'
import { normalizationService } from '../../../services/ebitdaNormalizationService'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { generalLogger } from '../../../utils/logger'
import { persistOrDeleteNormalizationsForYears } from '../../../utils/normalizationPersist'
import { updateSuggestedNormalisationStatus } from '../utils/manualAiNormalizationSuggestions'
import { getManualNormalizationYearsToPersist } from '../utils/manualNormalizationPersistence'

/**
 * Durable rejection memory for IMPORTED proposals.
 *
 * Suggested normalizations for a connected client are recomputed from the
 * ledger analysis on every load, and `persistNormalizationChange` only sends
 * accepted items to Titan — so until this existed a reject lived nowhere and the
 * same proposal came back next time. Fire-and-forget: a failed memory write
 * must never undo the local decision or block the recalculation.
 */
function rememberImportedRejection(
  id: string,
  sessionId: string | null | undefined,
  action: 'remember' | 'forget'
): void {
  if (!sessionId) return
  const item = useNormalizationStore.getState().items.find((n) => n.id === id)
  if (!item || item.source !== 'auto' || !item.ledgerCode) return
  const call =
    action === 'remember'
      ? normalizationService.rememberRejection(sessionId, item.ledgerCode, item.ledgerName)
      : normalizationService.forgetRejection(sessionId, item.ledgerCode)
  void call.catch((error) => {
    generalLogger.warn(`[ManualValuationWorkspace] Could not ${action} normalization rejection`, {
      id,
      ledgerCode: item.ledgerCode,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

interface ManualNormalizationActions {
  acceptItem: (id: string) => void
  rejectItem: (id: string) => void
  updateItem: (id: string, updates: Partial<NormalizationItem>) => void
}

export interface UseManualNormalizationReviewActionsParams {
  reportId: string
  resolvedReportId?: string | null
  normalizationActions: ManualNormalizationActions
  setSuggestedNormalisations: Dispatch<SetStateAction<SuggestedNormalisation[]>>
  financialYears: number[]
  originalEBITDAByYear: Record<number, number>
  recalculateWithNormalizations: (normalizations: NormalizationItem[]) => Promise<void>
  persistFailedTitle: string
  persistFailedDescription: string
}

export interface UseManualNormalizationReviewActionsResult {
  handleAcceptNormalisation: (id: string) => Promise<void>
  handleRejectNormalisation: (id: string) => Promise<void>
}

export function useManualNormalizationReviewActions({
  reportId,
  resolvedReportId,
  normalizationActions,
  setSuggestedNormalisations,
  financialYears,
  originalEBITDAByYear,
  recalculateWithNormalizations,
  persistFailedTitle,
  persistFailedDescription,
}: UseManualNormalizationReviewActionsParams): UseManualNormalizationReviewActionsResult {
  const persistNormalizationChange = useCallback(
    async (id: string, action: 'accept' | 'reject'): Promise<boolean> => {
      const idForApi = resolvedReportId || reportId
      if (!idForApi) return true

      const item = useNormalizationStore.getState().items.find((n) => n.id === id)
      if (!item) return true

      const years = getManualNormalizationYearsToPersist(item, financialYears)
      try {
        await persistOrDeleteNormalizationsForYears(
          idForApi,
          years,
          originalEBITDAByYear,
          useNormalizationStore.getState().items
        )
        return true
      } catch (error) {
        generalLogger.warn(
          `[ManualValuationWorkspace] Titan persist failed after ${action} - rolling back`,
          {
            id,
            error: error instanceof Error ? error.message : String(error),
          }
        )
        normalizationActions.updateItem(id, { status: 'pending' })
        setSuggestedNormalisations((prev) =>
          updateSuggestedNormalisationStatus(prev, id, 'pending')
        )
        toast.error(persistFailedTitle, { description: persistFailedDescription })
        return false
      }
    },
    [
      financialYears,
      normalizationActions,
      originalEBITDAByYear,
      persistFailedDescription,
      persistFailedTitle,
      reportId,
      resolvedReportId,
      setSuggestedNormalisations,
    ]
  )

  const handleAcceptNormalisation = useCallback(
    async (id: string) => {
      trackAINormalizationAccept()
      normalizationActions.acceptItem(id)
      setSuggestedNormalisations((prev) => updateSuggestedNormalisationStatus(prev, id, 'accepted'))
      rememberImportedRejection(id, resolvedReportId || reportId, 'forget')
      if (!(await persistNormalizationChange(id, 'accept'))) return
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [
      normalizationActions,
      persistNormalizationChange,
      recalculateWithNormalizations,
      reportId,
      resolvedReportId,
      setSuggestedNormalisations,
    ]
  )

  const handleRejectNormalisation = useCallback(
    async (id: string) => {
      normalizationActions.rejectItem(id)
      setSuggestedNormalisations((prev) => updateSuggestedNormalisationStatus(prev, id, 'rejected'))
      rememberImportedRejection(id, resolvedReportId || reportId, 'remember')
      if (!(await persistNormalizationChange(id, 'reject'))) return
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [
      normalizationActions,
      persistNormalizationChange,
      recalculateWithNormalizations,
      reportId,
      resolvedReportId,
      setSuggestedNormalisations,
    ]
  )

  return { handleAcceptNormalisation, handleRejectNormalisation }
}
