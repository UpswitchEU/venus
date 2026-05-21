import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage } from '../../../components/calculator'
import { useConversationStore } from '../../../store/useConversationStore'
import {
  buildManualChatRetryPlan,
  type ManualPendingFieldUpdate,
} from '../utils/manualChatCommandHandling'
import { mapStoredMessagesToManualChatMessages } from '../utils/manualChatHistory'

type ManualChatMessageSender = (content: string) => void | Promise<void>

export interface UseManualChatSessionActionsParams {
  chatDrawerOpen: boolean
  chatMessages: readonly ChatMessage[]
  clearConversationMessages: () => void
  handleChatMessage: ManualChatMessageSender
  isChatGenerating: boolean
  isLoadingHistory: boolean
  lastLoadedReportId?: string | null
  loadHistory: (reportId: string) => Promise<void>
  manualChatReportId?: string | null
  setChatMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  setConversationId: (conversationId: string | null) => void
  setIsChatGenerating: (isGenerating: boolean) => void
  setIsLoadingHistory: (isLoading: boolean) => void
  setPendingUpdates: (
    updates:
      | ManualPendingFieldUpdate[]
      | ((prev: ManualPendingFieldUpdate[]) => ManualPendingFieldUpdate[])
  ) => void
  setToolInProgress: (toolName: string | null) => void
  streamCleanupRef: MutableRefObject<(() => void) | null>
}

export interface UseManualChatSessionActionsResult {
  handleRetry: (errorMessageId: string) => void
  handleNewConversation: () => void
}

export function useManualChatSessionActions({
  chatDrawerOpen,
  chatMessages,
  clearConversationMessages,
  handleChatMessage,
  isChatGenerating,
  isLoadingHistory,
  lastLoadedReportId,
  loadHistory,
  manualChatReportId,
  setChatMessages,
  setConversationId,
  setIsChatGenerating,
  setIsLoadingHistory,
  setPendingUpdates,
  setToolInProgress,
  streamCleanupRef,
}: UseManualChatSessionActionsParams): UseManualChatSessionActionsResult {
  const generatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const needsLoad =
      manualChatReportId &&
      chatDrawerOpen &&
      !isLoadingHistory &&
      lastLoadedReportId !== manualChatReportId
    if (!needsLoad) return

    setIsLoadingHistory(true)
    loadHistory(manualChatReportId)
      .then(() => {
        const storeMessages = useConversationStore.getState().messages
        setChatMessages(mapStoredMessagesToManualChatMessages(storeMessages))
      })
      .finally(() => setIsLoadingHistory(false))
  }, [
    chatDrawerOpen,
    isLoadingHistory,
    lastLoadedReportId,
    loadHistory,
    manualChatReportId,
    setChatMessages,
    setIsLoadingHistory,
  ])

  useEffect(() => {
    return () => {
      streamCleanupRef.current?.()
    }
  }, [streamCleanupRef])

  useEffect(() => {
    if (isChatGenerating) {
      generatingTimeoutRef.current = setTimeout(() => {
        setIsChatGenerating(false)
        setToolInProgress(null)
      }, 120_000)
    } else if (generatingTimeoutRef.current) {
      clearTimeout(generatingTimeoutRef.current)
      generatingTimeoutRef.current = null
    }

    return () => {
      if (generatingTimeoutRef.current) clearTimeout(generatingTimeoutRef.current)
    }
  }, [isChatGenerating, setIsChatGenerating, setToolInProgress])

  const handleRetry = useCallback(
    (errorMessageId: string) => {
      if (isChatGenerating || isLoadingHistory) return
      const retryPlan = buildManualChatRetryPlan(chatMessages, errorMessageId)
      if (!retryPlan) return
      if (streamCleanupRef.current) {
        streamCleanupRef.current()
        streamCleanupRef.current = null
      }
      setChatMessages(retryPlan.messages)
      handleChatMessage(retryPlan.retryPrompt)
    },
    [
      chatMessages,
      handleChatMessage,
      isChatGenerating,
      isLoadingHistory,
      setChatMessages,
      streamCleanupRef,
    ]
  )

  const handleNewConversation = useCallback(() => {
    if (streamCleanupRef.current) {
      streamCleanupRef.current()
      streamCleanupRef.current = null
    }
    setIsChatGenerating(false)
    setToolInProgress(null)
    setChatMessages([])
    setPendingUpdates([])
    clearConversationMessages()
    setConversationId(null)
  }, [
    clearConversationMessages,
    setChatMessages,
    setConversationId,
    setIsChatGenerating,
    setPendingUpdates,
    setToolInProgress,
    streamCleanupRef,
  ])

  return {
    handleRetry,
    handleNewConversation,
  }
}
