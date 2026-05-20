import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  isImportedLedgerNormalizationItem,
  type SuggestedNormalisation,
} from '../../../components/calculator'
import { useNormalizationStore } from '../../../store/useNormalizationStore'

type NormalizationStoreState = ReturnType<typeof useNormalizationStore.getState>

export type ManualNormalizationActions = Pick<
  NormalizationStoreState,
  'acceptItem' | 'addItems' | 'persistToSession' | 'rejectItem' | 'setItems' | 'updateItem'
>

export interface UseManualNormalizationStateParams {
  hasImportQuality: boolean
  reportId: string
  resolvedReportId?: string | null
}

export interface UseManualNormalizationStateResult {
  hasImportedNormalizationData: boolean
  normalizationActions: ManualNormalizationActions
  normalizationItems: NormalizationStoreState['items']
  pendingNormalizationCount: number
  setSuggestedNormalisations: Dispatch<SetStateAction<SuggestedNormalisation[]>>
}

export function useManualNormalizationState({
  hasImportQuality,
  reportId,
  resolvedReportId,
}: UseManualNormalizationStateParams): UseManualNormalizationStateResult {
  const normalizationItems = useNormalizationStore((s) => s.items)
  const normalizationActions = useNormalizationStore(
    useShallow((s) => ({
      setItems: s.setItems,
      persistToSession: s.persistToSession,
      addItems: s.addItems,
      acceptItem: s.acceptItem,
      rejectItem: s.rejectItem,
      updateItem: s.updateItem,
    }))
  )
  const [suggestedNormalisations, setSuggestedNormalisations] = useState<SuggestedNormalisation[]>(
    []
  )

  useEffect(() => {
    const hasImportedPendingItems = normalizationItems.some(
      (item) => isImportedLedgerNormalizationItem(item) && item.status === 'pending'
    )
    if (!hasImportedPendingItems) return

    normalizationActions.setItems(
      normalizationItems.map((item) =>
        isImportedLedgerNormalizationItem(item) && item.status === 'pending'
          ? { ...item, status: 'accepted' as const }
          : item
      )
    )

    const idForApi = resolvedReportId || reportId
    if (idForApi) normalizationActions.persistToSession(idForApi)
  }, [normalizationActions, normalizationItems, reportId, resolvedReportId])

  const pendingNormalizationCount = normalizationItems.filter((n) => n.status === 'pending').length
  const hasImportedNormalizationData =
    hasImportQuality ||
    suggestedNormalisations.length > 0 ||
    normalizationItems.some((n) => n.source !== 'manual' && n.source !== 'ai')

  return {
    hasImportedNormalizationData,
    normalizationActions,
    normalizationItems,
    pendingNormalizationCount,
    setSuggestedNormalisations,
  }
}
