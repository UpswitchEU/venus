import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react'
import {
  resolveManualAgentNextPrompt,
  stripAgentNextFromHref,
} from '../utils/manualAgentNextHandoff'

type ManualChatMessageSender = (content: string) => void | Promise<void>

export interface UseManualAgentPromptHandoffParams {
  chatDrawerOpen: boolean
  handleChatMessage: ManualChatMessageSender
  initialAgentNext?: string | null
  isChatGenerating: boolean
  isLoadingHistory: boolean
  lastLoadedReportId?: string | null
  manualChatReportId?: string | null
  pendingPostValuationAgentPrompt?: string | null
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setPendingPostValuationAgentPrompt: Dispatch<SetStateAction<string | null>>
}

function isAgentPromptReady({
  chatDrawerOpen,
  isChatGenerating,
  isLoadingHistory,
  lastLoadedReportId,
  manualChatReportId,
}: Pick<
  UseManualAgentPromptHandoffParams,
  | 'chatDrawerOpen'
  | 'isChatGenerating'
  | 'isLoadingHistory'
  | 'lastLoadedReportId'
  | 'manualChatReportId'
>): boolean {
  return Boolean(
    manualChatReportId &&
      chatDrawerOpen &&
      !isChatGenerating &&
      !isLoadingHistory &&
      lastLoadedReportId === manualChatReportId
  )
}

export function useManualAgentPromptHandoff({
  chatDrawerOpen,
  handleChatMessage,
  initialAgentNext,
  isChatGenerating,
  isLoadingHistory,
  lastLoadedReportId,
  manualChatReportId,
  pendingPostValuationAgentPrompt,
  setChatDrawerOpen,
  setPendingPostValuationAgentPrompt,
}: UseManualAgentPromptHandoffParams) {
  const agentNextConsumedRef = useRef(false)

  useEffect(() => {
    const nextPrompt = resolveManualAgentNextPrompt(initialAgentNext)
    if (!nextPrompt) return
    if (agentNextConsumedRef.current) return
    if (!manualChatReportId) return

    if (!chatDrawerOpen) {
      setChatDrawerOpen(true)
      return
    }

    if (
      !isAgentPromptReady({
        chatDrawerOpen,
        isChatGenerating,
        isLoadingHistory,
        lastLoadedReportId,
        manualChatReportId,
      })
    ) {
      return
    }

    agentNextConsumedRef.current = true

    if (typeof window !== 'undefined') {
      const searchParams = new URL(window.location.href).searchParams
      if (searchParams.has('agent_next') || searchParams.has('ai_next')) {
        window.history.replaceState(
          window.history.state,
          '',
          stripAgentNextFromHref(window.location.href)
        )
      }
    }

    void handleChatMessage(nextPrompt)
  }, [
    initialAgentNext,
    manualChatReportId,
    chatDrawerOpen,
    isChatGenerating,
    isLoadingHistory,
    lastLoadedReportId,
    handleChatMessage,
    setChatDrawerOpen,
  ])

  useEffect(() => {
    if (!pendingPostValuationAgentPrompt) return
    if (!manualChatReportId) return

    if (!chatDrawerOpen) {
      setChatDrawerOpen(true)
      return
    }

    if (
      !isAgentPromptReady({
        chatDrawerOpen,
        isChatGenerating,
        isLoadingHistory,
        lastLoadedReportId,
        manualChatReportId,
      })
    ) {
      return
    }

    const prompt = pendingPostValuationAgentPrompt
    setPendingPostValuationAgentPrompt(null)
    void handleChatMessage(prompt)
  }, [
    pendingPostValuationAgentPrompt,
    manualChatReportId,
    chatDrawerOpen,
    isChatGenerating,
    isLoadingHistory,
    lastLoadedReportId,
    handleChatMessage,
    setChatDrawerOpen,
    setPendingPostValuationAgentPrompt,
  ])
}
