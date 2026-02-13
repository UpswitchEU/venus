/**
 * useStreamingChatState - DEPRECATED
 *
 * @deprecated This hook is no longer used. State management is now handled by
 * the Zustand store (useConversationStore). This file is kept only for type
 * re-exports (Message, ConversationMetrics) and will be removed in a future version.
 *
 * Legacy code - DO NOT USE. Use useConversationStore instead.
 */

import { useCallback, useRef, useState } from 'react'
import type { ConversationMetrics } from '../types/conversationMetrics'
import type { Message } from '../types/message'
import { chatLogger } from '../utils/logger'

// CRITICAL FIX: Message window management constants
// Limits message history to prevent unbounded growth and token limit issues
const MAX_MESSAGES = 100 // Maximum messages to keep in state
const PRUNE_THRESHOLD = 120 // When to trigger pruning
const KEEP_RECENT = 50 // Keep most recent N messages when pruning
const KEEP_FIRST = 10 // Keep first N messages (initial context)

// Re-export types for convenience
export type { ConversationMetrics } from '../types/conversationMetrics'
export type { Message } from '../types/message'

export interface StreamingChatState {
  // Core state
  messages: Message[]
  input: string
  isStreaming: boolean
  isTyping: boolean
  isThinking: boolean
  typingContext?: string
  collectedData: Record<string, any>
  valuationPreview: any
  calculateOption: any
  conversationMetrics: ConversationMetrics

  // Refs
  refs: {
    messagesEndRef: React.RefObject<HTMLDivElement>
    eventSourceRef: React.MutableRefObject<EventSource | null>
    currentStreamingMessageRef: React.MutableRefObject<Message | null>
    requestIdRef: React.MutableRefObject<string | null>
    hasInitializedRef: React.MutableRefObject<boolean>
    abortControllerRef: React.MutableRefObject<AbortController | null>
  }

  // Setters
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setInput: React.Dispatch<React.SetStateAction<string>>
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>
  setTypingContext: React.Dispatch<React.SetStateAction<string | undefined>>
  setCollectedData: React.Dispatch<React.SetStateAction<Record<string, any>>>
  setValuationPreview: React.Dispatch<React.SetStateAction<any>>
  setCalculateOption: React.Dispatch<React.SetStateAction<any>>
  setConversationMetrics: React.Dispatch<React.SetStateAction<ConversationMetrics>>
}

/**
 * Custom hook that manages all StreamingChat component state
 *
 * @param sessionId - Unique session identifier
 * @param userId - Optional user identifier
 * @returns Complete state object with values, refs, and setters
 */
export const useStreamingChatState = (sessionId: string, userId?: string): StreamingChatState => {
  // Core state variables
  const [messages, setMessages] = useState<Message[]>([])

  /**
   * CRITICAL FIX: Message window management
   * Prunes messages when conversation gets too long to prevent:
   * - Unbounded memory growth
   * - Context window limit issues
   * - Increased API costs
   */
  const pruneMessages = useCallback(
    (messageList: Message[]): Message[] => {
      if (messageList.length <= MAX_MESSAGES) {
        return messageList
      }

      // Keep first messages (initial context) and most recent messages
      const firstMessages = messageList.slice(0, KEEP_FIRST)
      const recentMessages = messageList.slice(-KEEP_RECENT)

      // Combine, removing duplicates
      const prunedMessages = [
        ...firstMessages,
        ...recentMessages.filter((msg) => !firstMessages.find((fm) => fm.id === msg.id)),
      ]

      // Use proper logger instead of console.warn
      chatLogger.warn('Message pruning triggered', {
        sessionId,
        originalCount: messageList.length,
        prunedCount: prunedMessages.length,
        keptFirst: firstMessages.length,
        keptRecent: recentMessages.length,
        removed: messageList.length - prunedMessages.length,
      })

      return prunedMessages
    },
    [sessionId]
  )

  // Wrapper for setMessages that includes pruning
  const setMessagesWithPruning = useCallback(
    (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
      setMessages((prev) => {
        const updated = typeof newMessages === 'function' ? newMessages(prev) : newMessages
        // Only prune if we exceed threshold to avoid unnecessary work
        return updated.length >= PRUNE_THRESHOLD ? pruneMessages(updated) : updated
      })
    },
    [pruneMessages]
  )
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [typingContext, setTypingContext] = useState<string | undefined>(undefined)
  const [collectedData, setCollectedData] = useState<Record<string, any>>({})
  const [valuationPreview, setValuationPreview] = useState<any>(null)
  const [calculateOption, setCalculateOption] = useState<any>(null)

  // Conversation metrics with initial values
  const [conversationMetrics, setConversationMetrics] = useState<ConversationMetrics>({
    session_id: sessionId,
    user_id: userId,
    started_at: new Date(),
    total_turns: 0,
    successful: false,
    ai_response_count: 0,
    user_message_count: 0,
    error_count: 0,
    retry_count: 0,
    avg_response_time_ms: 0,
    valuation_generated: false,
    data_completeness_percent: 0,
    collected_fields: [],
    total_tokens_used: 0,
    estimated_cost_usd: 0,
    feedback_provided: false,
  })

  // Refs for DOM elements and component state
  // NOTE: hasInitializedRef is legacy - initialization state is now managed by useConversationStore
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentStreamingMessageRef = useRef<Message | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const hasInitializedRef = useRef(false) // LEGACY: Not used anymore - kept for type compatibility only
  const abortControllerRef = useRef<AbortController | null>(null)

  return {
    // State values
    messages,
    input,
    isStreaming,
    isTyping,
    isThinking,
    typingContext,
    collectedData,
    valuationPreview,
    calculateOption,
    conversationMetrics,

    // Refs grouped for easy access
    refs: {
      messagesEndRef,
      eventSourceRef,
      currentStreamingMessageRef,
      requestIdRef,
      hasInitializedRef,
      abortControllerRef,
    },

    // State setters
    // CRITICAL FIX: Use pruned setter for messages to prevent unbounded growth
    setMessages: setMessagesWithPruning,
    setInput,
    setIsStreaming,
    setIsTyping,
    setIsThinking,
    setTypingContext,
    setCollectedData,
    setValuationPreview,
    setCalculateOption,
    setConversationMetrics,
  }
}
