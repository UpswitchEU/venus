import { type Dispatch, type MutableRefObject, type SetStateAction, useState } from 'react'
import type {
  ChatMessage,
  FieldContext,
  NormalizationItem,
  ParsedCommand,
  ParsedValue,
  SuggestedNormalisation,
} from '../../../components/calculator'
import type { ValuationFormData } from '../../../types/valuation'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import type { ManualPendingFieldUpdate } from '../utils/manualChatCommandHandling'
import { useManualAgentPromptHandoff } from './useManualAgentPromptHandoff'
import { useManualChatControllerState } from './useManualChatControllerState'
import { useManualChatFieldUpdateActions } from './useManualChatFieldUpdateActions'
import { useManualChatMessageActions } from './useManualChatMessageActions'
import { useManualChatSessionActions } from './useManualChatSessionActions'
import { useManualFieldHelpActions } from './useManualFieldHelpActions'
import type { ManualNormalizationActions } from './useManualNormalizationState'

export interface UseManualChatControllerParams {
  collectedData: CollectedData
  currentLocale: string
  initialAgentNext?: string | null
  initialDrawerOpen: boolean
  isAccountantMode: boolean
  latestFormDataRef: MutableRefObject<Partial<CollectedData>>
  manualChatReportId: string
  normalizationActions: Pick<ManualNormalizationActions, 'addItems' | 'persistToSession'>
  normalizationItems: NormalizationItem[]
  pendingPostValuationAgentPrompt?: string | null
  reportId: string
  resolvedReportId?: string | null
  setCollectedData: Dispatch<SetStateAction<CollectedData>>
  setPendingPostValuationAgentPrompt: Dispatch<SetStateAction<string | null>>
  setSuggestedNormalisations: Dispatch<SetStateAction<SuggestedNormalisation[]>>
  translate: (key: string) => string
  updateFormData: (updates: Partial<ValuationFormData>) => void
}

export interface UseManualChatControllerResult {
  chatDrawerOpen: boolean
  chatMessages: ChatMessage[]
  fieldContext?: FieldContext
  handleAcceptUpdate: (field: string) => void
  handleApplyFieldUpdate: (field: string, value: unknown) => void
  handleChatMessage: (
    content: string,
    attachments?: File[],
    detectedValues?: ParsedValue[],
    parsedCommands?: ParsedCommand[]
  ) => Promise<void>
  handleFieldHelpRequest: ReturnType<typeof useManualFieldHelpActions>['handleFieldHelpRequest']
  handleNewConversation: (messageId?: string) => void
  handleRejectUpdate: (field: string) => void
  handleRetry: (messageId: string) => void
  isChatGenerating: boolean
  isLoadingHistory: boolean
  pendingUpdates: ManualPendingFieldUpdate[]
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  startupToolInProgress?: string | null
}

export function useManualChatController({
  collectedData,
  currentLocale,
  initialAgentNext,
  initialDrawerOpen,
  isAccountantMode,
  latestFormDataRef,
  manualChatReportId,
  normalizationActions,
  normalizationItems,
  pendingPostValuationAgentPrompt,
  reportId,
  resolvedReportId,
  setCollectedData,
  setPendingPostValuationAgentPrompt,
  setSuggestedNormalisations,
  translate,
  updateFormData,
}: UseManualChatControllerParams): UseManualChatControllerResult {
  const {
    chatDrawerOpen,
    chatMessages,
    conversationStore,
    isChatGenerating,
    isLoadingHistory,
    setChatDrawerOpen,
    setChatMessages,
    setIsChatGenerating,
    setIsLoadingHistory,
    streamCleanupRef,
  } = useManualChatControllerState({ initialDrawerOpen })
  const [fieldContext, setFieldContext] = useState<FieldContext | undefined>(undefined)
  const [pendingUpdates, setPendingUpdates] = useState<ManualPendingFieldUpdate[]>([])

  const { handleApplyFieldUpdate, handleAcceptUpdate, handleRejectUpdate } =
    useManualChatFieldUpdateActions({
      currentLocale,
      setChatMessages,
      setCollectedData,
      setPendingUpdates,
      translate,
      updateFormData,
    })

  const { handleChatMessage } = useManualChatMessageActions<CollectedData>({
    addNormalizationItems: normalizationActions.addItems,
    chatMessages,
    collectedData,
    conversationId: conversationStore.conversationId,
    currentLocale,
    fieldContext,
    handleApplyFieldUpdate,
    isAccountantMode,
    isLoadingHistory,
    latestFormDataRef,
    manualChatReportId,
    normalizationItems,
    persistNormalizationsToSession: normalizationActions.persistToSession,
    reportId,
    resolvedReportId,
    setChatMessages,
    setConversationId: conversationStore.setConversationId,
    setIsChatGenerating,
    setPendingUpdates,
    setSuggestedNormalisations,
    setToolInProgress: conversationStore.setToolInProgress,
    streamCleanupRef,
    translate,
  })

  useManualAgentPromptHandoff({
    chatDrawerOpen,
    handleChatMessage,
    initialAgentNext,
    isChatGenerating,
    isLoadingHistory,
    lastLoadedReportId: conversationStore.lastLoadedReportId,
    manualChatReportId,
    pendingPostValuationAgentPrompt,
    setChatDrawerOpen,
    setPendingPostValuationAgentPrompt,
  })

  const { handleRetry, handleNewConversation } = useManualChatSessionActions({
    chatDrawerOpen,
    chatMessages,
    clearConversationMessages: conversationStore.clearMessages,
    handleChatMessage,
    isChatGenerating,
    isLoadingHistory,
    lastLoadedReportId: conversationStore.lastLoadedReportId,
    loadHistory: conversationStore.loadHistory,
    manualChatReportId,
    setChatMessages,
    setConversationId: conversationStore.setConversationId,
    setIsChatGenerating,
    setIsLoadingHistory,
    setPendingUpdates,
    setToolInProgress: conversationStore.setToolInProgress,
    streamCleanupRef,
  })

  const { handleFieldHelpRequest } = useManualFieldHelpActions({
    currentLocale,
    handleChatMessage,
    setChatDrawerOpen,
    setFieldContext,
  })

  return {
    chatDrawerOpen,
    chatMessages,
    fieldContext,
    handleAcceptUpdate,
    handleApplyFieldUpdate,
    handleChatMessage,
    handleFieldHelpRequest,
    handleNewConversation,
    handleRejectUpdate,
    handleRetry,
    isChatGenerating,
    isLoadingHistory,
    pendingUpdates,
    setChatDrawerOpen,
    setChatMessages,
    startupToolInProgress: conversationStore.toolInProgress,
  }
}
