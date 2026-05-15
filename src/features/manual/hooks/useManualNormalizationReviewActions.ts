import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import { trackAINormalizationAccept } from '@/lib/analytics'
import type { NormalizationItem, SuggestedNormalisation } from '../../../components/calculator'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { generalLogger } from '../../../utils/logger'
import { persistOrDeleteNormalizationsForYears } from '../../../utils/normalizationPersist'
import { updateSuggestedNormalisationStatus } from '../utils/manualAiNormalizationSuggestions'
import { getManualNormalizationYearsToPersist } from '../utils/manualNormalizationPersistence'

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
        generalLogger.warn(`[ManualLayout] Titan persist failed after ${action} - rolling back`, {
          id,
          error: error instanceof Error ? error.message : String(error),
        })
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
      if (!(await persistNormalizationChange(id, 'accept'))) return
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [
      normalizationActions,
      persistNormalizationChange,
      recalculateWithNormalizations,
      setSuggestedNormalisations,
    ]
  )

  const handleRejectNormalisation = useCallback(
    async (id: string) => {
      normalizationActions.rejectItem(id)
      setSuggestedNormalisations((prev) => updateSuggestedNormalisationStatus(prev, id, 'rejected'))
      if (!(await persistNormalizationChange(id, 'reject'))) return
      await recalculateWithNormalizations(useNormalizationStore.getState().items)
    },
    [
      normalizationActions,
      persistNormalizationChange,
      recalculateWithNormalizations,
      setSuggestedNormalisations,
    ]
  )

  return { handleAcceptNormalisation, handleRejectNormalisation }
}
