/**
 * Conversational Flow - Chat Store
 *
 * Manages chat state for the conversational valuation flow.
 * Isolated from manual flow to prevent race conditions.
 *
 * Key Features:
 * - Atomic functional updates (no race conditions)
 * - Message history management
 * - Typing indicators and thinking state
 * - Collected data from conversation
 *
 * @module store/conversational/useConversationalChatStore
 */

import { create } from 'zustand'
import { storeLogger } from '../../utils/logger'

// Message type for chat history
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    messageType?: string
    [key: string]: any
  }
}

interface ConversationalChatStore {
  // Chat state
  messages: ChatMessage[]
  isTyping: boolean
  isThinking: boolean
  collectedData: Record<string, any>

  // Actions (all atomic with functional updates)
  addMessage: (message: ChatMessage) => void
  setMessages: (messages: ChatMessage[]) => void
  setTyping: (isTyping: boolean) => void
  setThinking: (isThinking: boolean) => void
  updateCollectedData: (data: Record<string, any>) => void
  clearChat: () => void
}

export const useConversationalChatStore = create<ConversationalChatStore>((set, get) => ({
  // Initial state
  messages: [],
  isTyping: false,
  isThinking: false,
  collectedData: {},

  // Add message to chat history (atomic)
  addMessage: (message: ChatMessage) => {
    set((state) => {
      const updatedMessages = [...state.messages, message]

      storeLogger.debug('[Conversational] Message added', {
        messageId: message.id,
        role: message.role,
        contentLength: message.content.length,
        totalMessages: updatedMessages.length,
      })

      return {
        ...state,
        messages: updatedMessages,
      }
    })
  },

  // Set all messages (atomic) - for restoration
  setMessages: (messages: ChatMessage[]) => {
    set((state) => {
      storeLogger.info('[Conversational] Messages restored', {
        messageCount: messages.length,
      })

      return {
        ...state,
        messages,
      }
    })
  },

  // Set typing indicator (atomic)
  setTyping: (isTyping: boolean) => {
    set((state) => ({
      ...state,
      isTyping,
    }))
  },

  // Set thinking indicator (atomic)
  setThinking: (isThinking: boolean) => {
    set((state) => ({
      ...state,
      isThinking,
    }))
  },

  // Update collected data (atomic with deep merge)
  updateCollectedData: (data: Record<string, any>) => {
    set((state) => {
      const updatedCollectedData = {
        ...state.collectedData,
        ...data,
      }

      storeLogger.debug('[Conversational] Collected data updated', {
        newKeys: Object.keys(data),
        totalKeys: Object.keys(updatedCollectedData).length,
      })

      return {
        ...state,
        collectedData: updatedCollectedData,
      }
    })
  },

  // Clear chat (atomic)
  clearChat: () => {
    set((state) => ({
      ...state,
      messages: [],
      isTyping: false,
      isThinking: false,
      collectedData: {},
    }))

    storeLogger.info('[Conversational] Chat cleared')
  },
}))
