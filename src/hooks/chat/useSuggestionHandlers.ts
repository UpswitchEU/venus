/**
 * useSuggestionHandlers Hook
 *
 * Single Responsibility: Handle suggestion selection and clarification logic
 * Extracted from StreamingChat.tsx to follow SRP
 *
 * @module hooks/chat/useSuggestionHandlers
 */

import { useCallback } from 'react'
import { StreamEventHandler } from '../../services/chat/StreamEventHandler'
import { StreamingManager } from '../../services/chat/StreamingManager'
import type { Message } from '../../types/message'
import { chatLogger } from '../../utils/logger'

export interface UseSuggestionHandlersOptions {
  sessionId: string
  pythonSessionId: string | null
  userId?: string
  streamingManager: StreamingManager
  eventHandler: StreamEventHandler
  setIsStreaming: (streaming: boolean) => void
  setIsTyping: (typing: boolean) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
    updatedMessages: Message[]
    newMessage: Message
  }
  updateStreamingMessage: (content: string, isComplete?: boolean, metadata?: any) => void
  onHtmlPreviewUpdate?: (html: string, previewType: string) => void
  setInput: (value: string) => void
}

/**
 * Hook for handling suggestion selections and clarifications
 *
 * Manages:
 * - Suggestion selection
 * - Clarification confirmations
 * - Clarification rejections
 * - KBO suggestion handling
 */
export const useSuggestionHandlers = ({
  sessionId,
  pythonSessionId,
  userId,
  streamingManager,
  eventHandler,
  setIsStreaming,
  setIsTyping,
  addMessage,
  updateStreamingMessage,
  onHtmlPreviewUpdate,
  setInput,
}: UseSuggestionHandlersOptions) => {
  // Handle suggestion selection
  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      chatLogger.info('Suggestion selected', { suggestion, sessionId })
      setInput(suggestion)
    },
    [setInput, sessionId]
  )

  // Handle suggestion dismiss
  const handleSuggestionDismiss = useCallback(() => {
    // Dismiss suggestions - could add state for this if needed
  }, [])

  // Handle KBO suggestion selection (sends number or "none" directly to backend)
  const handleKBOSuggestionSelect = useCallback(
    async (selection: string) => {
      chatLogger.info('KBO suggestion selected', { selection, sessionId })

      const effectiveSessionId = pythonSessionId || sessionId

      // Send the selection (number or "none") directly to backend
      try {
        setIsStreaming(true)
        setIsTyping(true)

        await streamingManager.startStreaming(
          effectiveSessionId,
          selection, // Send "1", "2", "3", etc. or "none"
          userId,
          {
            setIsStreaming,
            addMessage,
            updateStreamingMessage,
            onContextUpdate: (context: any) => {
              onHtmlPreviewUpdate?.(context.html || '', context.preview_type || 'progressive')
            },
            extractBusinessModelFromInput: (_input: string) => null,
            extractFoundingYearFromInput: (_input: string) => null,
            onStreamStart: () => {
              eventHandler.reset()
              chatLogger.debug('Stream start - reset event handler state')
            },
          },
          (event) => {
            try {
              if (!eventHandler) {
                chatLogger.error('Event handler is null/undefined', {
                  sessionId: effectiveSessionId,
                })
                return
              }

              if (typeof eventHandler.handleEvent !== 'function') {
                chatLogger.error('Event handler handleEvent is not a function', {
                  sessionId: effectiveSessionId,
                  eventHandlerType: typeof eventHandler,
                })
                return
              }

              eventHandler.handleEvent(event)
            } catch (error) {
              chatLogger.error('Error in onEvent callback', {
                error: error instanceof Error ? error.message : String(error),
                eventType: event?.type,
                sessionId: event?.session_id || effectiveSessionId,
              })
            }
          },
          (error: Error) => {
            chatLogger.error('Streaming error during KBO selection', {
              error: error.message,
              sessionId: effectiveSessionId,
            })
            setIsStreaming(false)
            setIsTyping(false)
          }
        )
      } catch (error) {
        chatLogger.error('Failed to send KBO selection', {
          error: error instanceof Error ? error.message : String(error),
          selection,
          sessionId: effectiveSessionId,
        })
        setIsStreaming(false)
        setIsTyping(false)
      }
    },
    [
      sessionId,
      pythonSessionId,
      userId,
      streamingManager,
      eventHandler,
      setIsStreaming,
      setIsTyping,
      addMessage,
      updateStreamingMessage,
      onHtmlPreviewUpdate,
    ]
  )

  // Handle clarification confirmation
  const handleClarificationConfirm = useCallback(
    async (messageId: string) => {
      chatLogger.info('Clarification confirmed', { messageId, sessionId })

      const effectiveSessionId = pythonSessionId || sessionId

      try {
        setIsStreaming(true)
        setIsTyping(true)

        await streamingManager.startStreaming(
          effectiveSessionId,
          'yes', // Send confirmation
          userId,
          {
            setIsStreaming,
            addMessage,
            updateStreamingMessage,
            onContextUpdate: (context: any) => {
              onHtmlPreviewUpdate?.(context.html || '', context.preview_type || 'progressive')
            },
            extractBusinessModelFromInput: (_input: string) => null,
            extractFoundingYearFromInput: (_input: string) => null,
            onStreamStart: () => {
              eventHandler.reset()
              chatLogger.debug('Stream start - reset event handler state')
            },
          },
          (event) => {
            try {
              if (!eventHandler) {
                chatLogger.error('Event handler is null/undefined', {
                  sessionId: effectiveSessionId,
                })
                return
              }

              if (typeof eventHandler.handleEvent !== 'function') {
                chatLogger.error('Event handler handleEvent is not a function', {
                  sessionId: effectiveSessionId,
                  eventHandlerType: typeof eventHandler,
                })
                return
              }

              eventHandler.handleEvent(event)
            } catch (error) {
              chatLogger.error('Error in onEvent callback', {
                error: error instanceof Error ? error.message : String(error),
                eventType: event?.type,
                sessionId: event?.session_id || effectiveSessionId,
              })
            }
          },
          (error: Error) => {
            chatLogger.error('Streaming error during confirmation', {
              error: error.message,
              sessionId: effectiveSessionId,
            })
            setIsStreaming(false)
            setIsTyping(false)
          }
        )
      } catch (error) {
        chatLogger.error('Failed to send clarification confirmation', {
          error: error instanceof Error ? error.message : String(error),
          messageId,
          sessionId: effectiveSessionId,
        })
        setIsStreaming(false)
        setIsTyping(false)
      }
    },
    [
      sessionId,
      pythonSessionId,
      userId,
      streamingManager,
      eventHandler,
      setIsStreaming,
      setIsTyping,
      addMessage,
      updateStreamingMessage,
      onHtmlPreviewUpdate,
    ]
  )

  // Handle clarification rejection
  const handleClarificationReject = useCallback(
    async (messageId: string) => {
      chatLogger.info('Clarification rejected', { messageId, sessionId })

      const effectiveSessionId = pythonSessionId || sessionId

      try {
        setIsStreaming(true)
        setIsTyping(true)

        await streamingManager.startStreaming(
          effectiveSessionId,
          'no', // Send rejection
          userId,
          {
            setIsStreaming,
            addMessage,
            updateStreamingMessage,
            onContextUpdate: (context: any) => {
              onHtmlPreviewUpdate?.(context.html || '', context.preview_type || 'progressive')
            },
            extractBusinessModelFromInput: (_input: string) => null,
            extractFoundingYearFromInput: (_input: string) => null,
            onStreamStart: () => {
              eventHandler.reset()
              chatLogger.debug('Stream start - reset event handler state')
            },
          },
          (event) => {
            try {
              if (!eventHandler) {
                chatLogger.error('Event handler is null/undefined', {
                  sessionId: effectiveSessionId,
                })
                return
              }

              if (typeof eventHandler.handleEvent !== 'function') {
                chatLogger.error('Event handler handleEvent is not a function', {
                  sessionId: effectiveSessionId,
                  eventHandlerType: typeof eventHandler,
                })
                return
              }

              eventHandler.handleEvent(event)
            } catch (error) {
              chatLogger.error('Error in onEvent callback', {
                error: error instanceof Error ? error.message : String(error),
                eventType: event?.type,
                sessionId: event?.session_id || effectiveSessionId,
              })
            }
          },
          (error: Error) => {
            chatLogger.error('Streaming error during rejection', {
              error: error.message,
              sessionId: effectiveSessionId,
            })
            setIsStreaming(false)
            setIsTyping(false)
          }
        )
      } catch (error) {
        chatLogger.error('Failed to send clarification rejection', {
          error: error instanceof Error ? error.message : String(error),
          messageId,
          sessionId: effectiveSessionId,
        })
        setIsStreaming(false)
        setIsTyping(false)
      }
    },
    [
      sessionId,
      pythonSessionId,
      userId,
      streamingManager,
      eventHandler,
      setIsStreaming,
      setIsTyping,
      addMessage,
      updateStreamingMessage,
      onHtmlPreviewUpdate,
    ]
  )

  // Handle Business Type suggestion selection (sends number or "none" directly to backend)
  const handleBusinessTypeSuggestionSelect = useCallback(
    async (selection: string) => {
      chatLogger.info('Business type suggestion selected', { selection, sessionId })

      const effectiveSessionId = pythonSessionId || sessionId

      // Send the selection (number or "none") directly to backend
      try {
        setIsStreaming(true)
        setIsTyping(true)

        await streamingManager.startStreaming(
          effectiveSessionId,
          selection, // Send "1", "2", "3", etc. or "none"
          userId,
          {
            setIsStreaming,
            addMessage,
            updateStreamingMessage,
            onContextUpdate: (context: any) => {
              onHtmlPreviewUpdate?.(context.html || '', context.preview_type || 'progressive')
            },
            extractBusinessModelFromInput: (_input: string) => null,
            extractFoundingYearFromInput: (_input: string) => null,
            onStreamStart: () => {
              eventHandler.reset()
              chatLogger.debug('Stream start - reset event handler state')
            },
          },
          (event) => {
            try {
              if (!eventHandler) {
                chatLogger.error('Event handler is null/undefined', {
                  sessionId: effectiveSessionId,
                })
                return
              }

              if (typeof eventHandler.handleEvent !== 'function') {
                chatLogger.error('Event handler handleEvent is not a function', {
                  sessionId: effectiveSessionId,
                  eventHandlerType: typeof eventHandler,
                })
                return
              }

              eventHandler.handleEvent(event)
            } catch (error) {
              chatLogger.error('Error in onEvent callback', {
                error: error instanceof Error ? error.message : String(error),
                eventType: event?.type,
                sessionId: event?.session_id || effectiveSessionId,
              })
            }
          },
          (error: Error) => {
            chatLogger.error('Streaming error during business type selection', {
              error: error.message,
              sessionId: effectiveSessionId,
            })
            setIsStreaming(false)
            setIsTyping(false)
          }
        )
      } catch (error) {
        chatLogger.error('Failed to send business type selection', {
          error: error instanceof Error ? error.message : String(error),
          selection,
          sessionId: effectiveSessionId,
        })
        setIsStreaming(false)
        setIsTyping(false)
      }
    },
    [
      sessionId,
      pythonSessionId,
      userId,
      streamingManager,
      eventHandler,
      setIsStreaming,
      setIsTyping,
      addMessage,
      updateStreamingMessage,
      onHtmlPreviewUpdate,
    ]
  )

  return {
    handleSuggestionSelect,
    handleSuggestionDismiss,
    handleKBOSuggestionSelect,
    handleBusinessTypeSuggestionSelect,
    handleClarificationConfirm,
    handleClarificationReject,
  }
}
