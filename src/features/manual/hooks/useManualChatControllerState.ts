import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ChatMessage } from '../../../components/calculator'
import { useConversationStore } from '../../../store/useConversationStore'

export interface UseManualChatControllerStateParams {
  initialDrawerOpen: boolean
}

export function useManualChatControllerState({
  initialDrawerOpen,
}: UseManualChatControllerStateParams) {
  const [chatDrawerOpen, setChatDrawerOpen] = useState(initialDrawerOpen)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatGenerating, setIsChatGenerating] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const conversationStore = useConversationStore(
    useShallow((s) => ({
      lastLoadedReportId: s.lastLoadedReportId,
      conversationId: s.conversationId,
      toolInProgress: s.toolInProgress,
      setToolInProgress: s.setToolInProgress,
      setConversationId: s.setConversationId,
      loadHistory: s.loadHistory,
      clearMessages: s.clearMessages,
    }))
  )
  const streamCleanupRef = useRef<(() => void) | null>(null)

  return {
    chatDrawerOpen,
    chatMessages,
    conversationStore,
    isChatGenerating,
    isLoadingHistory,
    setChatDrawerOpen,
    setChatMessages,
    setConversationId: conversationStore.setConversationId,
    setIsChatGenerating,
    setIsLoadingHistory,
    setPendingToolInProgress: conversationStore.setToolInProgress,
    streamCleanupRef,
  }
}
