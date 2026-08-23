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
 * same proposal came back next time. This call is intentionally synchronous:
 * the UI may only show a persisted decision after Titan acknowledges it.
 */
async function persistImportedRejectionDecision(
  id: string,
  sessionId: string | null | undefined,
  action: 'remember' | 'forget'
): Promise<boolean> {
  if (!sessionId) return true
  const item = useNormalizationStore.getState().items.find((n) => n.id === id)
  if (!item || item.source !== 'auto' || !item.ledgerCode) return true
  const proposal = {
    ledgerCode: item.ledgerCode,
    ledgerName: item.ledgerName,
    fiscalYear: item.year,
    amount: item.adjustment,
    sourceRef: item.sourceRef ?? `${item.year}:${item.ledgerCode}`,
  }
  try {
    if (action === 'remember') {
      await normalizationService.rememberRejection(sessionId, proposal)
    } else {
      await normalizationService.forgetRejection(sessionId, proposal)
    }
    return true
  } catch (error) {
    generalLogger.warn(`[ManualValuationWorkspace] Could not ${action} normalization rejection`, {
      id,
      ledgerCode: item.ledgerCode,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
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
      if (!(await persistImportedRejectionDecision(id, resolvedReportId || reportId, 'forget'))) {
        toast.error(persistFailedTitle, { description: persistFailedDescription })
        return
      }
      normalizationActions.acceptItem(id)
      setSuggestedNormalisations((prev) => updateSuggestedNormalisationStatus(prev, id, 'accepted'))
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
      persistFailedDescription,
      persistFailedTitle,
    ]
  )

  const handleRejectNormalisation = useCallback(
    async (id: string) => {
      if (!(await persistImportedRejectionDecision(id, resolvedReportId || reportId, 'remember'))) {
        toast.error(persistFailedTitle, { description: persistFailedDescription })
        return
      }
      normalizationActions.rejectItem(id)
      setSuggestedNormalisations((prev) => updateSuggestedNormalisationStatus(prev, id, 'rejected'))
      // The acknowledged decision endpoint is the complete persistence action
      // for a rejection. Re-saving the accepted-items list here creates a
      // split-brain failure mode: the decision can be durable while a later,
      // unrelated save fails and rolls the UI back to "pending". Accepted
      // items did not change, so there is nothing else to persist.
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [
      normalizationActions,
      recalculateWithNormalizations,
      reportId,
      resolvedReportId,
      setSuggestedNormalisations,
      persistFailedDescription,
      persistFailedTitle,
    ]
  )

  return { handleAcceptNormalisation, handleRejectNormalisation }
}
