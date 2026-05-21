/**
 * Conversation Store - Zustand Store for AI Chat Messages
 *
 * Manages conversation state with server-side persistence via Titan.
 * Supports streaming, tool execution indicators, and conversation history loading.
 *
 * Key principles:
 * - Server is source of truth for history; local state for real-time UX
 * - Streaming state managed locally for instant updates
 * - Tool execution indicators for transparency
 */

import { create } from 'zustand'
import { aiChatService } from '../services/ai/AIChatService'
import type { Message } from '../types/message'
import { storeLogger } from '../utils/logger'

const MAX_MESSAGES = 100
const PRUNE_THRESHOLD = 120
const KEEP_RECENT = 50
const KEEP_FIRST = 10

export interface ConversationStore {
  // State
  messages: Message[]
  isStreaming: boolean
  isTyping: boolean
  isThinking: boolean
  typingContext?: string
  currentStreamingMessageId: string | null
  conversationId: string | null
  toolInProgress: string | null // Name of tool currently executing (e.g., "get_valuation_session")
  historyLoaded: boolean
  /** Report/session we last loaded history for — reset when switching valuations (accountant: client A → client B) */
  lastLoadedReportId: string | null

  // Simple actions
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, updates: Partial<Message>) => void
  appendToMessage: (id: string, content: string) => void
  setStreaming: (streaming: boolean) => void
  setTyping: (typing: boolean) => void
  setThinking: (thinking: boolean) => void
  setTypingContext: (context?: string) => void
  clearMessages: () => void
  setMessages: (messages: Message[]) => void
  setConversationId: (id: string | null) => void
  setToolInProgress: (toolName: string | null) => void

  // Server-side history
  loadHistory: (reportId: string) => Promise<void>

  // Initialization state management
  getInitializationState: (
    sessionId: string
  ) => { status: 'idle' | 'initializing' | 'ready' | 'failed'; promise?: Promise<void> } | undefined
  setInitializationState: (
    sessionId: string,
    state: { status: 'idle' | 'initializing' | 'ready' | 'failed'; promise?: Promise<void> }
  ) => void
  resetInitializationState: (sessionId: string) => void
  cleanupInitializationStates: (keepSessionIds: string[]) => void
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export interface ConversationHistoryRow {
  id?: string
  role: string
  content?: string | null
  tool_name?: string | null
  tool_result?: unknown
  created_at: string
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractPersistedToolResultData(row: ConversationHistoryRow): unknown {
  if (row.tool_result && typeof row.tool_result === 'object') {
    const persisted = row.tool_result as Record<string, unknown>
    return Object.hasOwn(persisted, 'data') ? persisted.data : row.tool_result
  }

  if (row.tool_result != null) return row.tool_result

  return parseJsonObject(row.content)
}

function attachPersistedToolResultToLatestAssistant(
  messages: Message[],
  row: ConversationHistoryRow
) {
  const toolName = typeof row.tool_name === 'string' ? row.tool_name.trim() : ''
  if (!toolName) return

  const latestAssistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === 'assistant' || message.type === 'ai')
  if (!latestAssistant) return

  const metadata = latestAssistant.metadata ?? {}
  const previousResults = Array.isArray(metadata.persistedToolResults)
    ? metadata.persistedToolResults
    : []

  latestAssistant.metadata = {
    ...metadata,
    persistedToolResults: [
      ...previousResults,
      {
        ...(row.id ? { id: row.id } : {}),
        toolName,
        result: extractPersistedToolResultData(row),
      },
    ],
  }
}

export function mapServerHistoryToMessages(
  rows: readonly ConversationHistoryRow[],
  createId: () => string = generateMessageId
): Message[] {
  const convertedMessages: Message[] = []

  for (const row of rows) {
    if (row.role === 'tool_result') {
      attachPersistedToolResultToLatestAssistant(convertedMessages, row)
      continue
    }

    if (row.role !== 'user' && row.role !== 'assistant') continue

    convertedMessages.push({
      id: row.id || createId(),
      type: row.role === 'user' ? 'user' : 'ai',
      role: row.role,
      content: row.content ?? '',
      timestamp: new Date(row.created_at),
    })
  }

  return convertedMessages
}

/**
 * Pure-function pruner exported for unit testing. The store calls this
 * when the message buffer crosses PRUNE_THRESHOLD; once pruned we drop
 * back to ~MAX_MESSAGES of "important" context (the first KEEP_FIRST
 * messages preserve the conversation's opening setup + the last
 * KEEP_RECENT preserve the active thread).
 *
 * Dedup-by-id is critical: when a conversation is shorter than
 * KEEP_FIRST + KEEP_RECENT, the two slices overlap. Naively
 * concatenating them duplicates the overlapping messages — which would
 * cascade into duplicate React keys, double-renders, and very surprising
 * UI behavior. The filter step removes the duplicates from the recent
 * slice (keeping the first-slice order canonical).
 */
export function pruneMessages(messages: Message[]): Message[] {
  if (messages.length <= MAX_MESSAGES) {
    return messages
  }

  const firstMessages = messages.slice(0, KEEP_FIRST)
  const recentMessages = messages.slice(-KEEP_RECENT)

  const prunedMessages = [
    ...firstMessages,
    ...recentMessages.filter((msg) => !firstMessages.find((fm) => fm.id === msg.id)),
  ]

  storeLogger.warn('Message pruning triggered', {
    originalCount: messages.length,
    prunedCount: prunedMessages.length,
  })

  return prunedMessages
}

const initializationState = new Map<
  string,
  {
    status: 'idle' | 'initializing' | 'ready' | 'failed'
    promise?: Promise<void>
  }
>()

export const useConversationStore = create<ConversationStore>((set, get) => {
  return {
    messages: [],
    isStreaming: false,
    isTyping: false,
    isThinking: false,
    typingContext: undefined,
    currentStreamingMessageId: null,
    conversationId: null,
    toolInProgress: null,
    historyLoaded: false,
    lastLoadedReportId: null,

    addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
      const id = generateMessageId()
      const newMessage: Message = {
        ...message,
        id,
        timestamp: new Date(),
      }

      set((state) => {
        let updatedMessages = [...state.messages]
        if (newMessage.isStreaming && state.currentStreamingMessageId) {
          updatedMessages = updatedMessages.map((msg) =>
            msg.id === state.currentStreamingMessageId
              ? { ...msg, isStreaming: false, isComplete: true }
              : msg
          )
        }

        updatedMessages = [...updatedMessages, newMessage]
        const prunedMessages =
          updatedMessages.length >= PRUNE_THRESHOLD
            ? pruneMessages(updatedMessages)
            : updatedMessages

        const streamingId = newMessage.isStreaming ? id : state.currentStreamingMessageId

        return {
          messages: prunedMessages,
          currentStreamingMessageId: streamingId,
        }
      })

      return id
    },

    updateMessage: (id: string, updates: Partial<Message>) => {
      set((state) => {
        const updatedMessages = state.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg
        )

        let streamingId = state.currentStreamingMessageId
        if (updates.isStreaming === false && id === state.currentStreamingMessageId) {
          streamingId = null
        } else if (updates.isStreaming === true && id !== state.currentStreamingMessageId) {
          streamingId = id
        }

        return {
          messages: updatedMessages,
          currentStreamingMessageId: streamingId,
        }
      })
    },

    appendToMessage: (id: string, content: string) => {
      if (!content) return

      set((state) => {
        let messageIndex = -1
        for (let i = 0; i < state.messages.length; i++) {
          if (state.messages[i].id === id) {
            messageIndex = i
            break
          }
        }

        if (messageIndex === -1) {
          const fallbackMessage = state.messages
            .slice()
            .reverse()
            .find((msg) => msg.isStreaming && !msg.isComplete)

          if (fallbackMessage) {
            const fallbackIndex = state.messages.findIndex((m) => m.id === fallbackMessage.id)
            if (fallbackIndex !== -1) {
              const updatedMessages = [...state.messages]
              updatedMessages[fallbackIndex] = {
                ...updatedMessages[fallbackIndex],
                content: updatedMessages[fallbackIndex].content + content,
              }
              return {
                messages: updatedMessages,
                currentStreamingMessageId: fallbackMessage.id,
              }
            }
          }

          return state
        }

        const updatedMessages = [...state.messages]
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          content: updatedMessages[messageIndex].content + content,
        }

        return { messages: updatedMessages }
      })
    },

    setStreaming: (streaming: boolean) => {
      set({ isStreaming: streaming })
      if (!streaming) {
        set({ currentStreamingMessageId: null, toolInProgress: null })
      }
    },

    setTyping: (typing: boolean) => {
      set({ isTyping: typing })
    },

    setThinking: (thinking: boolean) => {
      set({ isThinking: thinking })
    },

    setTypingContext: (context?: string) => {
      set({ typingContext: context })
    },

    clearMessages: () => {
      set({
        messages: [],
        currentStreamingMessageId: null,
        isStreaming: false,
        isTyping: false,
        isThinking: false,
        conversationId: null,
        toolInProgress: null,
        historyLoaded: false,
        lastLoadedReportId: null,
      })
    },

    setMessages: (messages: Message[]) => {
      const prunedMessages = messages.length >= PRUNE_THRESHOLD ? pruneMessages(messages) : messages
      const streamingMessage = prunedMessages.find((msg) => msg.isStreaming)
      set({
        messages: prunedMessages,
        currentStreamingMessageId: streamingMessage?.id || null,
      })
    },

    setConversationId: (id: string | null) => {
      set({ conversationId: id })
    },

    setToolInProgress: (toolName: string | null) => {
      set({ toolInProgress: toolName })
    },

    /**
     * Load conversation history from the server for a given report.
     * When reportId changes (e.g. accountant switches clients), reload for the new report.
     */
    loadHistory: async (reportId: string) => {
      const state = get()
      if (state.historyLoaded && state.lastLoadedReportId === reportId) return

      // Clear messages when switching reports (accountant: client A → B) to avoid showing stale history
      if (state.lastLoadedReportId && state.lastLoadedReportId !== reportId) {
        set({ messages: [], conversationId: null })
      }

      // Mark the target report so we can detect stale responses after await
      set({ lastLoadedReportId: reportId })

      try {
        const { conversationId, messages } = await aiChatService.loadHistory(reportId)

        // Guard: if the user switched reports while the request was in-flight,
        // discard this stale response to avoid overwriting the newer report's data.
        if (get().lastLoadedReportId !== reportId) return

        if (conversationId) {
          const convertedMessages = mapServerHistoryToMessages(messages)

          set({
            conversationId,
            messages: convertedMessages,
            historyLoaded: true,
            lastLoadedReportId: reportId,
          })

          storeLogger.debug('Loaded conversation history from server', {
            conversationId,
            messageCount: convertedMessages.length,
          })
        } else {
          set({ historyLoaded: true, lastLoadedReportId: reportId })
        }
      } catch (error) {
        if (get().lastLoadedReportId !== reportId) return
        storeLogger.warn('Failed to load conversation history', {
          error: error instanceof Error ? error.message : String(error),
        })
        set({ historyLoaded: true, lastLoadedReportId: reportId })
      }
    },

    getInitializationState: (sessionId: string) => {
      return initializationState.get(sessionId)
    },

    setInitializationState: (
      sessionId: string,
      state: { status: 'idle' | 'initializing' | 'ready' | 'failed'; promise?: Promise<void> }
    ) => {
      initializationState.set(sessionId, state)
    },

    resetInitializationState: (sessionId: string) => {
      initializationState.delete(sessionId)
    },

    cleanupInitializationStates: (keepSessionIds: string[]) => {
      const keepSet = new Set(keepSessionIds)
      for (const [sessionId] of initializationState) {
        if (!keepSet.has(sessionId)) {
          initializationState.delete(sessionId)
        }
      }
    },
  }
})
