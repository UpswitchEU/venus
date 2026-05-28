import type { ChatMessage } from '@/components/calculator'
import type { AIChatRequest, AIChatResponse } from '@/services/ai/AIChatService'
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

export type ManualChatBffStreamRecoverySource = 'bff-fallback' | 'bff-fallback-failed' | null

/**
 * Whether layer-3 client recovery should run. Skips duplicate `/chat` when the
 * BFF already recovered on the wire (`bff-fallback`), but still allows one FE
 * retry after `bff-fallback-failed` (staging 499 disconnect scenario).
 */
export function shouldAttemptManualChatNonStreamingRecovery({
  nonStreamingRecoveryStarted,
  didObserveToolActivity,
  bffStreamRecoverySource,
}: {
  nonStreamingRecoveryStarted: boolean
  didObserveToolActivity: boolean
  bffStreamRecoverySource: ManualChatBffStreamRecoverySource
}): boolean {
  if (nonStreamingRecoveryStarted || didObserveToolActivity) return false
  if (bffStreamRecoverySource === 'bff-fallback') return false
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
    const aiResponse = await sendMessage({ ...aiRequest, stream: false })

    const terminalErrorPatch = buildManualChatTerminalErrorPatchFromAIResponse(aiResponse, translate)
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
        ...responseCards,
      },
      ...(aiResponse.conversationId ? { conversationId: aiResponse.conversationId } : {}),
      ...(responseCards.fieldUpdates ? { fieldUpdates: responseCards.fieldUpdates } : {}),
      ...(responseCards.normalisationSuggestions
        ? { normalisationSuggestions: responseCards.normalisationSuggestions }
        : {}),
      showAiUnavailableToast: Boolean(aiResponse.fallback),
    }
  } catch {
    return {
      status: 'terminal_error',
      patch: buildManualChatTerminalErrorPatch({ kind: 'generic' }, translate),
    }
  }
}
