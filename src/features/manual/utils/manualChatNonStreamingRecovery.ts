import type { ChatMessage } from '@/components/calculator'
import type { AIChatRequest, AIChatResponse } from '@/services/ai/AIChatService'
import { isOfflineFallbackContent } from '@/services/ai/local-chat-fallback'
import { resolveReturnedConversationIdUpdate } from './manualChatConversationId'
import {
  type PollHistoryForPersistedAnswerParams,
  pollHistoryForPersistedAnswer,
} from './manualChatPersistedAnswerRecovery'
import {
  buildManualChatTerminalErrorPatch,
  buildManualChatTerminalErrorPatchFromAIResponse,
  type ManualChatTerminalErrorPatch,
} from './manualChatTerminalErrors'
import { addIdsToManualChatToolCards, manualChatToolCardsHasContent } from './manualChatToolCards'

type ManualChatMessageTranslator = (key: string) => string

export interface ManualChatNonStreamingRecoveryParams {
  aiRequest: AIChatRequest
  sendMessage: (request: AIChatRequest) => Promise<AIChatResponse>
  translate: ManualChatMessageTranslator
  createId: () => string
}

export type ManualChatNonStreamingRecoveryOutcome =
  | {
      status: 'recovered'
      patch: Partial<ChatMessage>
      conversationId?: string
      fieldUpdates?: NonNullable<AIChatResponse['fieldUpdates']>
      normalisationSuggestions?: unknown[]
      showAiUnavailableToast: boolean
    }
  | { status: 'terminal_error'; patch: ManualChatTerminalErrorPatch }
  | { status: 'miss' }

type ManualChatRecoveredOutcome = Extract<
  ManualChatNonStreamingRecoveryOutcome,
  { status: 'recovered' }
>
type PollPersistedAnswer = typeof pollHistoryForPersistedAnswer

export type ManualChatBffStreamRecoverySource =
  | 'bff-fallback'
  | 'bff-fallback-failed'
  | 'bff-stream-incomplete'
  | null

export function shouldAttemptManualChatNonStreamingRecovery({
  nonStreamingRecoveryStarted,
  didObserveToolActivity,
  bffStreamRecoverySource,
  streamEndedWithoutCompletion,
}: {
  nonStreamingRecoveryStarted: boolean
  didObserveToolActivity: boolean
  bffStreamRecoverySource: ManualChatBffStreamRecoverySource
  streamEndedWithoutCompletion?: boolean
}): boolean {
  if (nonStreamingRecoveryStarted) return false
  if (bffStreamRecoverySource === 'bff-fallback') return false
  if (bffStreamRecoverySource === 'bff-fallback-failed') return true
  if (bffStreamRecoverySource === 'bff-stream-incomplete') return true
  if (streamEndedWithoutCompletion) return true
  if (didObserveToolActivity) return false
  return true
}

/**
 * Last-resort `/api/ai/chat` recovery with `stream: false`. Shared by the
 * empty-stream branch and the stream error branch so both surfaces stay in
 * lockstep with Mercury's `requestDockNonStreamingRecovery`.
 */
export async function requestManualChatNonStreamingRecovery({
  aiRequest,
  sendMessage,
  translate,
  createId,
}: ManualChatNonStreamingRecoveryParams): Promise<ManualChatNonStreamingRecoveryOutcome> {
  try {
    const aiResponse = await sendMessage({
      ...aiRequest,
      stream: false,
      recoverFromStreamTurn: true,
    })

    const terminalErrorPatch = buildManualChatTerminalErrorPatchFromAIResponse(
      aiResponse,
      translate
    )
    if (terminalErrorPatch) {
      return { status: 'terminal_error', patch: terminalErrorPatch }
    }

    const responseCards = addIdsToManualChatToolCards(aiResponse, createId)
    const hasVisibleContent =
      (typeof aiResponse.content === 'string' && aiResponse.content.trim().length > 0) ||
      manualChatToolCardsHasContent(responseCards)

    if (!hasVisibleContent) {
      return { status: 'miss' }
    }

    return {
      status: 'recovered',
      patch: {
        content: aiResponse.content,
        ...(aiResponse.fallback || isOfflineFallbackContent(aiResponse.content)
          ? { isOfflineFallback: true }
          : {}),
        ...responseCards,
      },
      ...(aiResponse.conversationId ? { conversationId: aiResponse.conversationId } : {}),
      ...(responseCards.fieldUpdates ? { fieldUpdates: responseCards.fieldUpdates } : {}),
      ...(responseCards.normalisationSuggestions
        ? { normalisationSuggestions: responseCards.normalisationSuggestions }
        : {}),
      showAiUnavailableToast: Boolean(
        aiResponse.fallback || isOfflineFallbackContent(aiResponse.content)
      ),
    }
  } catch {
    return {
      status: 'terminal_error',
      patch: buildManualChatTerminalErrorPatch({ kind: 'generic' }, translate),
    }
  }
}

export interface RunManualChatNonStreamingRecoveryParams {
  aiRequest: AIChatRequest
  sendMessage: (request: AIChatRequest) => Promise<AIChatResponse>
  loadHistory: PollHistoryForPersistedAnswerParams['loadHistory']
  translate: ManualChatMessageTranslator
  createId: () => string
  isCancelled: () => boolean
  currentConversationId?: string | null
  fallbackHistoryReportId?: string | null
  setConversationId: (conversationId: string) => void
  cancelAssistantContentFrame: () => void
  patchAssistantMessage: (patch: Partial<ChatMessage>) => void
  markReceivedContent?: () => void
  showAiUnavailableToast?: () => void
  pollPersistedAnswer?: PollPersistedAnswer
  onFieldUpdates?: (fieldUpdates: NonNullable<ManualChatRecoveredOutcome['fieldUpdates']>) => void
  onNormalisationSuggestions?: (
    suggestions: NonNullable<ManualChatRecoveredOutcome['normalisationSuggestions']>
  ) => void
}

/**
 * Applies layer-3 recovery outcomes for one active manual-chat turn.
 *
 * The hook owns turn lifecycle and transport cleanup; this function owns the
 * recovered/missed/terminal semantics so empty-stream recovery stays testable
 * outside the large React hook.
 */
export async function runManualChatNonStreamingRecovery({
  aiRequest,
  sendMessage,
  loadHistory,
  translate,
  createId,
  isCancelled,
  currentConversationId,
  fallbackHistoryReportId,
  setConversationId,
  cancelAssistantContentFrame,
  patchAssistantMessage,
  markReceivedContent,
  showAiUnavailableToast,
  pollPersistedAnswer = pollHistoryForPersistedAnswer,
  onFieldUpdates,
  onNormalisationSuggestions,
}: RunManualChatNonStreamingRecoveryParams): Promise<void> {
  const outcome = await requestManualChatNonStreamingRecovery({
    aiRequest,
    sendMessage,
    translate,
    createId,
  })
  if (isCancelled()) return

  switch (outcome.status) {
    case 'terminal_error':
    case 'miss': {
      const persisted = await pollPersistedAnswer({
        loadHistory,
        reportId: aiRequest.sessionId || fallbackHistoryReportId || '',
        userContent: aiRequest.message,
        isCancelled,
      })
      if (isCancelled()) return
      if (persisted) {
        markReceivedContent?.()
        cancelAssistantContentFrame()
        patchAssistantMessage({ content: persisted.content })
        return
      }

      patchAssistantMessage(
        outcome.status === 'terminal_error'
          ? outcome.patch
          : buildManualChatTerminalErrorPatch({ kind: 'generic' }, translate)
      )
      return
    }
    case 'recovered': {
      const nextConversationId = resolveReturnedConversationIdUpdate(
        currentConversationId,
        outcome.conversationId
      )
      if (nextConversationId) {
        setConversationId(nextConversationId)
      }
      cancelAssistantContentFrame()
      patchAssistantMessage(outcome.patch)
      if (outcome.showAiUnavailableToast) {
        showAiUnavailableToast?.()
      }
      if (outcome.fieldUpdates) {
        onFieldUpdates?.(outcome.fieldUpdates)
      }
      if (outcome.normalisationSuggestions) {
        onNormalisationSuggestions?.(outcome.normalisationSuggestions)
      }
      return
    }
  }
}
