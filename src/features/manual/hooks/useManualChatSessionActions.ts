import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { ChatMessage } from '../../../components/calculator'
import { aiChatService } from '../../../services/ai/AIChatService'
import { useConversationStore } from '../../../store/useConversationStore'
import {
  buildManualChatRetryPlan,
  type ManualPendingFieldUpdate,
} from '../utils/manualChatCommandHandling'
import { mapStoredMessagesToManualChatMessages } from '../utils/manualChatHistory'

import type { ManualChatSendHandler } from './useManualChatMessageActions'

export interface UseManualChatSessionActionsParams {
  currentLocale?: string
  chatDrawerOpen: boolean
  chatMessages: readonly ChatMessage[]
  clearConversationMessages: () => void
  handleChatMessage: ManualChatSendHandler
  isChatGenerating: boolean
  isLoadingHistory: boolean
  lastLoadedReportId?: string | null
  loadHistory: (reportId: string, force?: boolean) => Promise<void>
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
  restoreProposals?: (messages: ChatMessage[]) => ChatMessage[]
}

export interface UseManualChatSessionActionsResult {
  handleRetry: (errorMessageId: string) => void
  handleNewConversation: () => void
}

export function useManualChatSessionActions({
  currentLocale = 'en',
  chatDrawerOpen,
  chatMessages,
  clearConversationMessages,
  handleChatMessage,
  isChatGenerating,
  isLoadingHistory,
  loadHistory,
  manualChatReportId,
  setChatMessages,
  setConversationId,
  setIsChatGenerating,
  setIsLoadingHistory,
  setPendingUpdates,
  setToolInProgress,
  streamCleanupRef,
  restoreProposals,
}: UseManualChatSessionActionsParams): UseManualChatSessionActionsResult {
  const generatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratedScopeRef = useRef<string | null>(null)
  const historyGenerationRef = useRef(0)
  const resetInFlightRef = useRef(false)

  useEffect(() => {
    if (!manualChatReportId) hydratedScopeRef.current = null
    return () => {
      ++historyGenerationRef.current
    }
  }, [manualChatReportId])

  useEffect(() => {
    if (!manualChatReportId || !chatDrawerOpen || hydratedScopeRef.current === manualChatReportId)
      return
    const generation = ++historyGenerationRef.current
    let cancelled = false
    setChatMessages([])
    setPendingUpdates([])
    setIsLoadingHistory(true)
    void (async () => {
      try {
        await loadHistory(manualChatReportId, true)
        const state = useConversationStore.getState()
        if (
          cancelled ||
          generation !== historyGenerationRef.current ||
          state.lastLoadedReportId !== manualChatReportId
        )
          return
        const messages = mapStoredMessagesToManualChatMessages(state.messages)
        hydratedScopeRef.current = manualChatReportId
        const restored = restoreProposals ? restoreProposals(messages) : messages
        setChatMessages((live) => {
          const liveIds = new Set(live.map((message) => message.id))
          return [...restored.filter((message) => !liveIds.has(message.id)), ...live]
        })
      } catch {
        if (!cancelled && generation === historyGenerationRef.current) {
          toast.error(
            currentLocale === 'nl'
              ? 'Het gesprek kon niet worden geladen. Probeer opnieuw.'
              : 'Could not load the conversation. Please try again.'
          )
        }
      } finally {
        if (!cancelled && generation === historyGenerationRef.current) setIsLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    chatDrawerOpen,
    currentLocale,
    loadHistory,
    manualChatReportId,
    setChatMessages,
    setIsLoadingHistory,
    setPendingUpdates,
    restoreProposals,
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

  const handleNewConversation = useCallback(async () => {
    if (resetInFlightRef.current || isLoadingHistory || !manualChatReportId) return
    resetInFlightRef.current = true
    streamCleanupRef.current?.()
    streamCleanupRef.current = null
    setIsChatGenerating(false)
    setToolInProgress(null)
    setIsLoadingHistory(true)
    const generation = ++historyGenerationRef.current
    try {
      const conversationId = await aiChatService.resetConversation(manualChatReportId)
      if (generation !== historyGenerationRef.current) return
      clearConversationMessages()
      useConversationStore.setState({ historyLoaded: true, lastLoadedReportId: manualChatReportId })
      hydratedScopeRef.current = manualChatReportId
      setConversationId(conversationId)
      setChatMessages([])
      setPendingUpdates([])
    } catch {
      if (generation === historyGenerationRef.current) {
        toast.error(
          currentLocale === 'nl'
            ? 'Een nieuw gesprek starten is niet gelukt. Je huidige gesprek is behouden.'
            : 'Could not start a new conversation. Your current conversation has been kept.'
        )
      }
    } finally {
      resetInFlightRef.current = false
      if (generation === historyGenerationRef.current) setIsLoadingHistory(false)
    }
  }, [
    clearConversationMessages,
    currentLocale,
    isLoadingHistory,
    manualChatReportId,
    setChatMessages,
    setConversationId,
    setIsChatGenerating,
    setIsLoadingHistory,
    setPendingUpdates,
    setToolInProgress,
    streamCleanupRef,
  ])

  return {
    handleRetry,
    handleNewConversation,
  }
}
