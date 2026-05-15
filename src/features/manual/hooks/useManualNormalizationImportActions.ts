import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import type {
  ChatMessage,
  NormalizationItem,
  SuggestedNormalisation,
} from '../../../components/calculator'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'
import {
  buildManualImportedNormalizationSuggestions,
  MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS,
  type ManualNormalizationImportSource,
} from '../utils/manualAiNormalizationSuggestions'
import { buildManualAssistantChatMessage } from '../utils/manualChatMessages'
import type { OpenManualNormalizationModalOptions } from './useManualNormalizationModalController'

interface ManualNormalizationImportActions {
  persistToSession: (id: string) => void
  setItems: (items: NormalizationItem[]) => void
}

interface ManualNormalizationImportCollectedData {
  companyName?: string
  industry?: string
}

type ManualNormalizationImportTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string

export interface UseManualNormalizationImportActionsParams<
  TCollectedData extends ManualNormalizationImportCollectedData,
> {
  collectedData: TCollectedData
  normalizationActions: ManualNormalizationImportActions
  openUnifiedNormalizationModal: (opts?: OpenManualNormalizationModalOptions) => void
  reportId: string
  resolvedReportId?: string | null
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setSuggestedNormalisations: Dispatch<SetStateAction<SuggestedNormalisation[]>>
  translate: ManualNormalizationImportTranslator
}

export interface UseManualNormalizationImportActionsResult {
  handleCSVImportComplete: (
    source: ManualNormalizationImportSource,
    fileName?: string
  ) => Promise<void>
}

export function useManualNormalizationImportActions<
  TCollectedData extends ManualNormalizationImportCollectedData,
>({
  collectedData,
  normalizationActions,
  openUnifiedNormalizationModal,
  reportId,
  resolvedReportId,
  setChatDrawerOpen,
  setChatMessages,
  setSuggestedNormalisations,
  translate,
}: UseManualNormalizationImportActionsParams<TCollectedData>): UseManualNormalizationImportActionsResult {
  const handleCSVImportComplete = useCallback(
    async (source: ManualNormalizationImportSource, _fileName?: string) => {
      const sourceLabel = MANUAL_NORMALIZATION_IMPORT_SOURCE_LABELS[source]
      toast.success(translate('importStarted', { source: sourceLabel }), {
        description: translate('importStartedDesc'),
      })

      try {
        const response = await fetch('/api/ai/normalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            sessionId: reportId,
            source,
            companyName: collectedData.companyName,
            industry: collectedData.industry,
            financialData: collectedData,
          }),
        })

        let suggestions: unknown[] = []
        if (response.ok) {
          const data = (await response.json()) as { suggestions?: unknown[] }
          suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
        }

        const {
          items: unifiedItems,
          reviewSuggestions,
          chatSuggestions,
        } = buildManualImportedNormalizationSuggestions({
          suggestions,
          source,
          filingYear: getCurrentFilingYear(),
        })

        setSuggestedNormalisations(reviewSuggestions)
        normalizationActions.setItems(unifiedItems)
        openUnifiedNormalizationModal({ track: false })
        setChatDrawerOpen(true)

        const idForApi = resolvedReportId || reportId
        if (idForApi) normalizationActions.persistToSession(idForApi)

        setChatMessages((prev) => [
          ...prev,
          {
            ...buildManualAssistantChatMessage({
              id: crypto.randomUUID(),
              content: translate('importAnalyzed', {
                source: sourceLabel,
                count: unifiedItems.length,
              }),
            }),
            normalisationSuggestions: chatSuggestions,
          },
        ])
      } catch (error) {
        generalLogger.error('[ManualLayout] CSV import analysis failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(translate('importAnalysisFailed'), {
          description: translate('importAnalysisFailedDesc'),
        })
      }
    },
    [
      collectedData,
      normalizationActions,
      openUnifiedNormalizationModal,
      reportId,
      resolvedReportId,
      setChatDrawerOpen,
      setChatMessages,
      setSuggestedNormalisations,
      translate,
    ]
  )

  return { handleCSVImportComplete }
}
