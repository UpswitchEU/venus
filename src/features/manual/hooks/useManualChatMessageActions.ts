import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import type {
  ChatMessage,
  FieldContext,
  NormalizationItem,
  ParsedCommand,
  ParsedValue,
  SuggestedNormalisation,
} from '../../../components/calculator'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'
import { buildManualAiNormalizationSuggestions } from '../utils/manualAiNormalizationSuggestions'
import {
  buildPendingUpdatesFromDetectedValues,
  formatManualParsedCommandResponse,
  type ManualPendingFieldUpdate,
} from '../utils/manualChatCommandHandling'
import { resolveReturnedConversationIdUpdate } from '../utils/manualChatConversationId'
import {
  buildManualAssistantChatMessage,
  buildManualUserChatMessage,
  patchManualChatMessage,
} from '../utils/manualChatMessages'
import {
  buildManualAIChatRequest,
  getManualChatVersionCount,
  type ManualChatFinancialContext,
} from '../utils/manualChatRequestContext'
import {
  buildManualChatTerminalErrorPatch,
  buildManualChatTerminalErrorPatchFromAIResponse,
  type ManualChatTerminalErrorState,
} from '../utils/manualChatTerminalErrors'
import {
  addIdsToManualChatToolCards,
  appendManualChatToolCardsToMessages,
  parseManualChatStreamToolResult,
} from '../utils/manualChatToolCards'

type ManualChatMessageTranslator = (key: string) => string
type ApplyManualFieldUpdate = (field: string, value: unknown) => void
type SetManualChatMessages = Dispatch<SetStateAction<ChatMessage[]>>
type SetManualPendingUpdates = Dispatch<SetStateAction<ManualPendingFieldUpdate[]>>
type SetManualSuggestedNormalisations = Dispatch<SetStateAction<SuggestedNormalisation[]>>
type AddNormalizationItems = (items: NormalizationItem[]) => void
type PersistNormalizationsToSession = (reportId: string) => void | Promise<void>

export interface UseManualChatMessageActionsParams<TCollectedData extends object> {
  chatMessages: ChatMessage[]
  collectedData: TCollectedData
  conversationId?: string | null
  currentLocale: string
  fieldContext?: FieldContext
  handleApplyFieldUpdate: ApplyManualFieldUpdate
  isAccountantMode: boolean
  isLoadingHistory: boolean
  latestFormDataRef: MutableRefObject<Partial<TCollectedData>>
  manualChatReportId?: string | null
  normalizationItems: NormalizationItem[]
  persistNormalizationsToSession: PersistNormalizationsToSession
  reportId: string
  resolvedReportId?: string | null
  setChatMessages: SetManualChatMessages
  setConversationId: (conversationId: string | null) => void
  setIsChatGenerating: (isGenerating: boolean) => void
  setPendingUpdates: SetManualPendingUpdates
  setSuggestedNormalisations: SetManualSuggestedNormalisations
  setToolInProgress: (toolName: string | null) => void
  streamCleanupRef: MutableRefObject<(() => void) | null>
  translate: ManualChatMessageTranslator
  addNormalizationItems: AddNormalizationItems
}

export interface UseManualChatMessageActionsResult {
  handleChatMessage: (
    content: string,
    attachments?: File[],
    detectedValues?: ParsedValue[],
    parsedCommands?: ParsedCommand[]
  ) => Promise<void>
}

export function useManualChatMessageActions<TCollectedData extends object>({
  addNormalizationItems,
  chatMessages,
  collectedData,
  conversationId,
  currentLocale,
  fieldContext,
  handleApplyFieldUpdate,
  isAccountantMode,
  isLoadingHistory,
  latestFormDataRef,
  manualChatReportId,
  normalizationItems,
  persistNormalizationsToSession,
  reportId,
  resolvedReportId,
  setChatMessages,
  setConversationId,
  setIsChatGenerating,
  setPendingUpdates,
  setSuggestedNormalisations,
  setToolInProgress,
  streamCleanupRef,
  translate,
}: UseManualChatMessageActionsParams<TCollectedData>): UseManualChatMessageActionsResult {
  const handleNormalisationSuggestions = useCallback(
    (suggestions: unknown[] | undefined) => {
      if (!suggestions?.length) return
      const { items, reviewSuggestions } = buildManualAiNormalizationSuggestions({
        suggestions,
        filingYear: getCurrentFilingYear(),
        createId: () => crypto.randomUUID(),
      })
      addNormalizationItems(items)
      const idForApi = resolvedReportId || reportId
      if (idForApi) void persistNormalizationsToSession(idForApi)
      setSuggestedNormalisations((prev) => [...prev, ...reviewSuggestions])
    },
    [
      addNormalizationItems,
      persistNormalizationsToSession,
      reportId,
      resolvedReportId,
      setSuggestedNormalisations,
    ]
  )

  const handleChatMessage = useCallback(
    async (
      content: string,
      attachments?: File[],
      detectedValues?: ParsedValue[],
      parsedCommands?: ParsedCommand[]
    ) => {
      // Allow non-empty user messages (e.g. quality-warning CTAs) while
      // history hydrates; only block empty triggers during load.
      if (isLoadingHistory && !content.trim()) return

      const userMessage = buildManualUserChatMessage({
        id: crypto.randomUUID(),
        content,
        attachments,
        createObjectUrl: (attachment) => URL.createObjectURL(attachment),
      })
      setChatMessages((prev) => [...prev, userMessage])
      setIsChatGenerating(true)

      try {
        // Handle parsed commands locally, no AI call needed.
        if (parsedCommands?.length) {
          parsedCommands.forEach((cmd) => handleApplyFieldUpdate(cmd.field, cmd.value))
          await new Promise<void>((resolve) => setTimeout(resolve, 500))
          setChatMessages((prev) => [
            ...prev,
            buildManualAssistantChatMessage({
              id: crypto.randomUUID(),
              content: formatManualParsedCommandResponse({
                parsedCommands,
                currentLocale,
                heading: translate('normApplied'),
              }),
            }),
          ])
          setIsChatGenerating(false)
          return
        }

        if (detectedValues?.length) {
          setPendingUpdates((prev) => [
            ...prev,
            ...buildPendingUpdatesFromDetectedValues(detectedValues),
          ])
        }

        const { aiChatService } = await import('../../../services/ai/AIChatService')
        const aiRequest = buildManualAIChatRequest({
          message: content,
          reportId: manualChatReportId || undefined,
          currentLocale,
          collectedData: collectedData as Record<string, unknown>,
          latestFormData: latestFormDataRef.current as ManualChatFinancialContext,
          fieldContext,
          normalizationItems,
          conversationId: conversationId || undefined,
          chatMessages,
          versionCount: getManualChatVersionCount(
            useVersionHistoryStore.getState().versions,
            manualChatReportId || resolvedReportId || reportId
          ),
          audience: isAccountantMode ? 'advisor' : 'owner',
        })

        const streamingMsgId = crypto.randomUUID()
        let streamedContent = ''
        const clearActiveStream = () => {
          streamCleanupRef.current = null
          setToolInProgress(null)
        }
        const patchAssistantMessage = (patch: Partial<ChatMessage>) => {
          setChatMessages((prev) => patchManualChatMessage(prev, streamingMsgId, patch))
        }
        const finishWithTerminalError = (state: ManualChatTerminalErrorState) => {
          clearActiveStream()
          setIsChatGenerating(false)
          patchAssistantMessage(buildManualChatTerminalErrorPatch(state, translate))
        }

        setChatMessages((prev) => [
          ...prev,
          buildManualAssistantChatMessage({ id: streamingMsgId }),
        ])

        if (streamCleanupRef.current) {
          streamCleanupRef.current()
          streamCleanupRef.current = null
        }

        streamCleanupRef.current = aiChatService.streamMessage(aiRequest, {
          onText: (text) => {
            streamedContent += text
            patchAssistantMessage({ content: streamedContent })
          },
          onToolStart: (toolName) => {
            setToolInProgress(toolName)
          },
          onToolResult: (toolName, result) => {
            setToolInProgress(null)
            const cards = parseManualChatStreamToolResult(toolName, result, () =>
              crypto.randomUUID()
            )
            if (!cards) return

            setChatMessages((prev) =>
              appendManualChatToolCardsToMessages(prev, streamingMsgId, cards)
            )

            const fieldUpdates = cards.fieldUpdates
            if (fieldUpdates) {
              setPendingUpdates((prev) => [...prev, ...fieldUpdates])
            }
            const normalisationSuggestions = cards.normalisationSuggestions
            if (normalisationSuggestions) {
              handleNormalisationSuggestions(normalisationSuggestions)
            }
          },
          onDone: (responseConversationId) => {
            clearActiveStream()
            setIsChatGenerating(false)

            const nextConversationId = resolveReturnedConversationIdUpdate(
              conversationId,
              responseConversationId
            )
            if (nextConversationId) {
              setConversationId(nextConversationId)
            }
          },
          onQuotaExhausted: () => {
            finishWithTerminalError({ kind: 'quota' })
          },
          onConsentRequired: (payload) => {
            finishWithTerminalError({
              kind: 'consent',
              message: payload.message,
              currentPolicyVersion: payload.currentPolicyVersion,
            })
          },
          onAuthRequired: (payload) => {
            finishWithTerminalError({ kind: 'auth', message: payload.message })
          },
          onError: (error) => {
            clearActiveStream()

            generalLogger.warn('Streaming failed, falling back to non-streaming', { error })
            aiChatService
              .sendMessage({ ...aiRequest, stream: false })
              .then((aiResponse) => {
                const terminalErrorPatch = buildManualChatTerminalErrorPatchFromAIResponse(
                  aiResponse,
                  translate
                )
                if (terminalErrorPatch) {
                  patchAssistantMessage(terminalErrorPatch)
                  return
                }

                const nextConversationId = resolveReturnedConversationIdUpdate(
                  conversationId,
                  aiResponse.conversationId
                )
                if (nextConversationId) {
                  setConversationId(nextConversationId)
                }

                const responseCards = addIdsToManualChatToolCards(aiResponse, () =>
                  crypto.randomUUID()
                )
                patchAssistantMessage({
                  content: aiResponse.content,
                  ...responseCards,
                })

                if (aiResponse.fallback) {
                  toast.info(translate('aiUnavailable'), {
                    description: translate('aiUnavailableDesc'),
                    duration: 4000,
                  })
                }
                const responseFieldUpdates = responseCards.fieldUpdates
                if (responseFieldUpdates) {
                  setPendingUpdates((prev) => [...prev, ...responseFieldUpdates])
                }
                handleNormalisationSuggestions(responseCards.normalisationSuggestions)
              })
              .catch(() => {
                patchAssistantMessage(
                  buildManualChatTerminalErrorPatch({ kind: 'generic' }, translate)
                )
              })
              .finally(() => {
                setIsChatGenerating(false)
              })
          },
        })
      } catch {
        setToolInProgress(null)
        setChatMessages((prev) => [
          ...prev,
          buildManualAssistantChatMessage({
            id: crypto.randomUUID(),
            content: translate('chatError'),
            isError: true,
          }),
        ])
        setIsChatGenerating(false)
      }
    },
    [
      chatMessages,
      collectedData,
      conversationId,
      currentLocale,
      fieldContext,
      handleApplyFieldUpdate,
      handleNormalisationSuggestions,
      isAccountantMode,
      isLoadingHistory,
      latestFormDataRef,
      manualChatReportId,
      normalizationItems,
      reportId,
      resolvedReportId,
      setChatMessages,
      setConversationId,
      setIsChatGenerating,
      setPendingUpdates,
      setToolInProgress,
      streamCleanupRef,
      translate,
    ]
  )

  return { handleChatMessage }
}
