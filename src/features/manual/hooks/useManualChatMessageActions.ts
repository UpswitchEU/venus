import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
} from 'react'
import { toast } from 'sonner'
import { type AssistantIntent, isOfflineFallbackContent } from '@/services/ai/local-chat-fallback'
import type {
  ChatMessage,
  FieldContext,
  NormalizationItem,
  ParsedCommand,
  ParsedValue,
  SuggestedNormalisation,
} from '../../../components/calculator'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'
import { buildManualAiNormalizationSuggestions } from '../utils/manualAiNormalizationSuggestions'
import {
  appendManualChatAttachmentContext,
  buildManualChatAttachmentSummaries,
} from '../utils/manualChatAttachments'
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
import { requestManualChatNonStreamingRecovery } from '../utils/manualChatNonStreamingRecovery'
import { pollHistoryForPersistedAnswer } from '../utils/manualChatPersistedAnswerRecovery'
import {
  buildManualAIChatRequest,
  getManualChatVersionCount,
  type ManualChatFinancialContext,
  type ManualChatValuationSummary,
} from '../utils/manualChatRequestContext'
import {
  resolveManualChatOnDoneAction,
  resolveManualChatOnErrorAction,
  resolveManualChatRecoverySkipAction,
} from '../utils/manualChatStreamTurnHandlers'
import {
  buildManualChatTerminalErrorPatch,
  type ManualChatTerminalErrorState,
} from '../utils/manualChatTerminalErrors'
import {
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
  isChatGenerating: boolean
  isLoadingHistory: boolean
  latestFormDataRef: MutableRefObject<Partial<TCollectedData>>
  manualChatReportId?: string | null
  normalizationItems: NormalizationItem[]
  valuationSummary?: ManualChatValuationSummary | null
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

export type ManualChatSendHandler = (
  content: string,
  attachments?: File[],
  detectedValues?: ParsedValue[],
  parsedCommands?: ParsedCommand[],
  assistantIntent?: AssistantIntent
) => Promise<void>

export interface UseManualChatMessageActionsResult {
  handleChatMessage: ManualChatSendHandler
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
  isChatGenerating,
  isLoadingHistory,
  latestFormDataRef,
  manualChatReportId,
  normalizationItems,
  valuationSummary,
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
  const clientUserId = useClientContext((state) => state.client?.id ?? null)
  const activeChatTurnIdRef = useRef<string | null>(null)

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
      parsedCommands?: ParsedCommand[],
      assistantIntent?: AssistantIntent
    ) => {
      // Allow non-empty user messages (e.g. quality-warning CTAs) while
      // history hydrates; only block empty triggers during load.
      if (isLoadingHistory && !content.trim()) return
      if (isChatGenerating && !parsedCommands?.length) return

      const userMessage = buildManualUserChatMessage({
        id: crypto.randomUUID(),
        content,
        attachments,
        createObjectUrl: (attachment) => URL.createObjectURL(attachment),
      })
      setChatMessages((prev) => [...prev, userMessage])
      setIsChatGenerating(true)

      const streamingMsgId = crypto.randomUUID()

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

        const attachmentSummaries = await buildManualChatAttachmentSummaries(attachments)
        const messageWithAttachmentContext = appendManualChatAttachmentContext(
          content,
          attachmentSummaries
        )

        const { aiChatService } = await import('../../../services/ai/AIChatService')
        const aiRequest = buildManualAIChatRequest({
          message: messageWithAttachmentContext,
          reportId: manualChatReportId || undefined,
          currentLocale,
          collectedData: collectedData as Record<string, unknown>,
          latestFormData: latestFormDataRef.current as ManualChatFinancialContext,
          fieldContext,
          normalizationItems,
          valuationSummary,
          conversationId: conversationId || undefined,
          chatMessages,
          versionCount: getManualChatVersionCount(
            useVersionHistoryStore.getState().versions,
            manualChatReportId || resolvedReportId || reportId
          ),
          audience: isAccountantMode ? 'advisor' : 'owner',
          clientUserId: isAccountantMode ? clientUserId : null,
          assistantIntent,
        })

        const turnId = crypto.randomUUID()
        activeChatTurnIdRef.current = turnId
        let streamedContent = ''
        // Track whether the stream produced anything user-visible. Either
        // text or a rendered tool card counts; neither one means Titan closed
        // the SSE with no payload (the silent-empty-stream bug the Mercury
        // dock used to hit — proxy short-circuit, Anthropic end_turn with
        // no content, or a gate stripping the synthesized fallback). Without
        // this flag the assistant bubble silently stays blank after onDone.
        let hasReceivedAnyContent = false
        let didObserveToolActivity = false
        let nonStreamingRecoveryStarted = false
        let bffStreamRecoverySource:
          | 'bff-fallback'
          | 'bff-fallback-failed'
          | 'bff-stream-incomplete'
          | null = null
        const patchAssistantMessage = (patch: Partial<ChatMessage>) => {
          if (activeChatTurnIdRef.current !== turnId) return
          setChatMessages((prev) => patchManualChatMessage(prev, streamingMsgId, patch))
        }
        let pendingAssistantContentFrame: number | null = null
        const cancelAssistantContentFrame = () => {
          if (pendingAssistantContentFrame == null) return
          if (typeof globalThis.cancelAnimationFrame === 'function') {
            globalThis.cancelAnimationFrame(pendingAssistantContentFrame)
          }
          pendingAssistantContentFrame = null
        }
        const flushAssistantContent = () => {
          cancelAssistantContentFrame()
          if (streamedContent.length > 0) {
            patchAssistantMessage({ content: streamedContent })
          }
        }
        const scheduleAssistantContentFlush = () => {
          if (typeof globalThis.requestAnimationFrame !== 'function') {
            flushAssistantContent()
            return
          }
          if (pendingAssistantContentFrame != null) return
          pendingAssistantContentFrame = globalThis.requestAnimationFrame(() => {
            pendingAssistantContentFrame = null
            if (activeChatTurnIdRef.current !== turnId) return
            if (streamedContent.length > 0) {
              patchAssistantMessage({ content: streamedContent })
            }
          })
        }
        const clearActiveStream = () => {
          cancelAssistantContentFrame()
          streamCleanupRef.current?.()
          streamCleanupRef.current = null
          setToolInProgress(null)
        }
        const finishWithTerminalError = (state: ManualChatTerminalErrorState) => {
          clearActiveStream()
          setIsChatGenerating(false)
          patchAssistantMessage(buildManualChatTerminalErrorPatch(state, translate))
        }
        const recoverViaNonStreamingChat = (
          streamEndedWithoutCompletion = false,
          emptyStream = false
        ): boolean => {
          const skipAction = resolveManualChatRecoverySkipAction({
            nonStreamingRecoveryStarted,
            didObserveToolActivity,
            bffStreamRecoverySource,
            streamEndedWithoutCompletion,
            emptyStream,
            hasReceivedAnyContent,
          })
          if (skipAction.kind === 'terminal_error') {
            finishWithTerminalError({ kind: 'generic' })
            return false
          }
          if (skipAction.kind === 'finish_with_content') {
            flushAssistantContent()
            clearActiveStream()
            setIsChatGenerating(false)
            return false
          }
          nonStreamingRecoveryStarted = true
          // Do not abort the streaming fetch here — aborting Venus /api/ai/chat while
          // the BFF is still running Titan inline chat recovery causes 499s and forces
          // the offline template. Let the stream request finish; abort only after recovery.
          setIsChatGenerating(true)
          generalLogger.warn('Streaming produced no visible content, falling back to non-streaming')
          void requestManualChatNonStreamingRecovery({
            aiRequest,
            sendMessage: aiChatService.sendMessage.bind(aiChatService),
            translate,
            createId: () => crypto.randomUUID(),
          })
            .then(async (outcome) => {
              if (activeChatTurnIdRef.current !== turnId) return
              switch (outcome.status) {
                case 'terminal_error':
                case 'miss': {
                  // Self-healing last resort. Titan runs the Claude turn on an
                  // internal timeout (not the inbound request signal), so it
                  // finishes and PERSISTS the answer even when the stream +
                  // /chat connections both died ~100ms in (the staging
                  // client/edge disconnect). Poll conversation history for that
                  // persisted answer before surfacing a dead "verbinding
                  // verbroken" — the answer simply landed a few seconds late.
                  const persisted = await pollHistoryForPersistedAnswer({
                    loadHistory: aiChatService.loadHistory.bind(aiChatService),
                    reportId:
                      aiRequest.sessionId ||
                      manualChatReportId ||
                      resolvedReportId ||
                      reportId ||
                      '',
                    userContent: aiRequest.message,
                    isCancelled: () => activeChatTurnIdRef.current !== turnId,
                  })
                  if (activeChatTurnIdRef.current !== turnId) return
                  if (persisted) {
                    hasReceivedAnyContent = true
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
                    conversationId,
                    outcome.conversationId
                  )
                  if (nextConversationId) {
                    setConversationId(nextConversationId)
                  }
                  cancelAssistantContentFrame()
                  patchAssistantMessage(outcome.patch)
                  if (outcome.showAiUnavailableToast) {
                    toast.info(translate('aiUnavailable'), {
                      description: translate('aiUnavailableDesc'),
                      duration: 4000,
                    })
                  }
                  const recoveredFieldUpdates = outcome.fieldUpdates
                  if (recoveredFieldUpdates) {
                    setPendingUpdates((prev) => [...prev, ...recoveredFieldUpdates])
                  }
                  handleNormalisationSuggestions(outcome.normalisationSuggestions)
                  return
                }
              }
            })
            .finally(() => {
              if (activeChatTurnIdRef.current !== turnId) return
              clearActiveStream()
              setIsChatGenerating(false)
            })
          return true
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
            if (text.trim().length > 0) {
              hasReceivedAnyContent = true
            }
            scheduleAssistantContentFlush()
          },
          onToolStart: (toolName) => {
            didObserveToolActivity = true
            setToolInProgress(toolName)
          },
          onToolResult: (toolName, result) => {
            setToolInProgress(null)
            flushAssistantContent()
            const cards = parseManualChatStreamToolResult(toolName, result, () =>
              crypto.randomUUID()
            )
            if (!cards) return

            // A rendered card counts as user-visible content for the empty-
            // stream guard in onDone — even a turn with no prose has happened
            // if a tool card landed.
            hasReceivedAnyContent = true
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
          onDone: (responseConversationId, meta) => {
            const doneAction = resolveManualChatOnDoneAction({
              hasReceivedAnyContent,
              bffStreamRecoverySource,
              streamIncomplete: meta?.incomplete === true,
            })

            if (doneAction.kind === 'recover') {
              recoverViaNonStreamingChat(
                doneAction.streamEndedWithoutCompletion,
                doneAction.emptyStream
              )
              return
            }

            flushAssistantContent()
            if (isOfflineFallbackContent(streamedContent)) {
              patchAssistantMessage({ isOfflineFallback: true })
              toast.info(translate('aiUnavailable'), {
                description: translate('aiUnavailableDesc'),
                duration: 4000,
              })
            }
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
          onBffStreamRecovery: (source) => {
            bffStreamRecoverySource = source
          },
          onError: (error) => {
            generalLogger.warn('Streaming failed, falling back to non-streaming', { error })
            const errorAction = resolveManualChatOnErrorAction({ hasReceivedAnyContent })
            if (errorAction.kind === 'finish_with_content') {
              if (isOfflineFallbackContent(streamedContent)) {
                flushAssistantContent()
                patchAssistantMessage({ isOfflineFallback: true })
              }
              flushAssistantContent()
              clearActiveStream()
              setIsChatGenerating(false)
              return
            }
            recoverViaNonStreamingChat(errorAction.streamEndedWithoutCompletion)
          },
        })
      } catch {
        streamCleanupRef.current?.()
        streamCleanupRef.current = null
        setToolInProgress(null)
        const errorPatch = buildManualChatTerminalErrorPatch({ kind: 'generic' }, translate)
        setChatMessages((prev) =>
          streamingMsgId
            ? patchManualChatMessage(prev, streamingMsgId, errorPatch)
            : [
                ...prev,
                buildManualAssistantChatMessage({
                  id: crypto.randomUUID(),
                  content: errorPatch.content ?? translate('chatError'),
                  isError: errorPatch.isError,
                }),
              ]
        )
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
      clientUserId,
      isChatGenerating,
      isLoadingHistory,
      latestFormDataRef,
      manualChatReportId,
      normalizationItems,
      valuationSummary,
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
