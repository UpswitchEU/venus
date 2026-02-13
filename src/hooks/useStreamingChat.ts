/**
 * useStreamingChat Hook - DEPRECATED/UNUSED
 *
 * @deprecated This hook is not currently used in the codebase. Streaming conversation
 * is handled by useStreamingCoordinator and useConversationStore (Zustand).
 * This file is kept for reference only and may be removed in a future version.
 *
 * Legacy code - DO NOT USE. Use useStreamingCoordinator + useConversationStore instead.
 */

import { useCallback, useRef, useState } from 'react'
import { streamingChatService } from '../services/chat/streamingChatService'
import { chatLogger } from '../utils/logger'
import {
  completeMessage,
  createMessage,
  createStreamingMessage,
  filterValidMessages,
  type Message,
  updateMessageContent,
} from '../utils/messageUtils'

interface StreamingChatState {
  messages: Message[]
  isStreaming: boolean
  currentStreamingMessage: Message | null
}

interface StreamingChatActions {
  addMessage: (message: Message) => void
  startStreaming: (userInput: string) => Promise<void>
  stopStreaming: () => void
  clearMessages: () => void
}

/**
 * Hook for managing streaming chat functionality
 */
export const useStreamingChat = (
  sessionId: string,
  userId?: string,
  onMessageComplete?: (message: Message) => void,
  onValuationComplete?: (result: any) => void,
  onReportUpdate?: (htmlContent: string, progress: number) => void,
  onProgressUpdate?: (items: any[]) => void
): StreamingChatState & StreamingChatActions => {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<Message | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      const validMessages = filterValidMessages(prev)
      return [...validMessages, message]
    })
  }, [])

  const startStreaming = useCallback(
    async (userInput: string) => {
      if (isStreaming) {
        chatLogger.warn('Streaming already in progress, ignoring new request')
        return
      }

      setIsStreaming(true)

      // Add user message
      const userMessage = createMessage('user', userInput)
      addMessage(userMessage)

      // Create streaming AI message
      const streamingMessage = createStreamingMessage('ai')
      setCurrentStreamingMessage(streamingMessage)
      addMessage(streamingMessage)

      try {
        chatLogger.info('Starting streaming conversation', { sessionId, userId })

        const stream = streamingChatService.streamConversation(sessionId, userInput, userId)

        for await (const event of stream) {
          if (event.type === 'message_chunk') {
            // Update streaming message content
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null
              const updated = updateMessageContent(prev, event.content || '')
              setMessages((prevMessages) => {
                const validMessages = filterValidMessages(prevMessages)
                return validMessages.map((msg) => (msg.id === prev.id ? updated : msg))
              })
              return updated
            })
          } else if (event.type === 'message_complete') {
            // Complete the streaming message
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null
              const completed = completeMessage(prev)
              setMessages((prevMessages) => {
                const validMessages = filterValidMessages(prevMessages)
                return validMessages.map((msg) => (msg.id === prev.id ? completed : msg))
              })
              onMessageComplete?.(completed)
              return null
            })
          } else if (event.type === 'report_update') {
            onReportUpdate?.(event.html || '', event.progress || 0)
          } else if (event.type === 'error') {
            chatLogger.error('Streaming error', { error: event.content })
            // Complete the streaming message with error
            setCurrentStreamingMessage((prev) => {
              if (!prev) return null
              const errorMessage = completeMessage(
                updateMessageContent(prev, `Error: ${event.content}`)
              )
              setMessages((prevMessages) => {
                const validMessages = filterValidMessages(prevMessages)
                return validMessages.map((msg) => (msg.id === prev.id ? errorMessage : msg))
              })
              return null
            })
          }
        }
      } catch (error) {
        chatLogger.error('Streaming conversation failed', { error })

        // Complete the streaming message with error
        setCurrentStreamingMessage((prev) => {
          if (!prev) return null
          const errorMessage = completeMessage(
            updateMessageContent(prev, 'Sorry, I encountered an error. Please try again.')
          )
          setMessages((prevMessages) => {
            const validMessages = filterValidMessages(prevMessages)
            return validMessages.map((msg) => (msg.id === prev.id ? errorMessage : msg))
          })
          return null
        })
      } finally {
        setIsStreaming(false)
        setCurrentStreamingMessage(null)
      }
    },
    [isStreaming, sessionId, userId, addMessage, onMessageComplete, onReportUpdate]
  )

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsStreaming(false)
    setCurrentStreamingMessage(null)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isStreaming,
    currentStreamingMessage,
    addMessage,
    startStreaming,
    stopStreaming,
    clearMessages,
  }
}
