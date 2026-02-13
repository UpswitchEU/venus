/**
 * StreamingManager - Handles streaming conversation logic
 *
 * Extracted from StreamingChat.tsx to reduce component complexity and improve maintainability.
 * Centralizes all streaming logic including async generators, EventSource fallback, and retry mechanisms.
 *
 * CRITICAL: Lock Release Robustness
 * - Lock is released in BOTH catch and finally blocks
 * - AbortController ensures proper cleanup
 * - Cleanup method for component unmount
 */

import type { Message } from '../../types/message'
import { debugLogger } from '../../utils/debugLogger'
import { chatLogger } from '../../utils/logger'
import { streamingChatService } from './streamingChatService'

export interface StreamingManagerCallbacks {
  setIsStreaming: (streaming: boolean) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
    updatedMessages: Message[]
    newMessage: Message
  }
  updateStreamingMessage: (content: string, isComplete?: boolean) => void
  onContextUpdate?: (context: any) => void
  extractBusinessModelFromInput: (input: string) => string | null
  extractFoundingYearFromInput: (input: string) => number | null
  onStreamStart?: () => void // CRITICAL FIX: Callback to reset event handler state when new stream starts
}

/**
 * Centralized streaming manager for conversation handling
 *
 * Handles all streaming operations including:
 * - Async generator streaming
 * - EventSource fallback
 * - Retry logic with exponential backoff
 * - Request deduplication
 * - Timeout handling
 */
export class StreamingManager {
  private requestIdRef: React.MutableRefObject<string | null>
  private currentStreamingMessageRef: React.MutableRefObject<Message | null>
  private currentAbortController: AbortController | null = null
  private isRequestInProgressRef: React.MutableRefObject<boolean> | null = null
  private setIsStreamingCallback: ((streaming: boolean) => void) | null = null

  constructor(
    requestIdRef: React.MutableRefObject<string | null>,
    currentStreamingMessageRef: React.MutableRefObject<Message | null>
  ) {
    this.requestIdRef = requestIdRef
    this.currentStreamingMessageRef = currentStreamingMessageRef
  }

  /**
   * CRITICAL: Set refs for robust lock management
   * Called from StreamingChat to provide lock control refs
   */
  setLockRefs(
    isRequestInProgressRef: React.MutableRefObject<boolean>,
    setIsStreamingCallback: (streaming: boolean) => void
  ): void {
    this.isRequestInProgressRef = isRequestInProgressRef
    this.setIsStreamingCallback = setIsStreamingCallback
  }

  /**
   * CRITICAL: Release all locks - called on errors or cleanup
   * Ensures both requestId lock and isRequestInProgress ref are cleared
   */
  private releaseLocks(reason: string, requestId?: string): void {
    debugLogger.warn('[StreamingManager]', `Releasing locks: ${reason}`, { requestId })

    this.requestIdRef.current = null

    if (this.isRequestInProgressRef) {
      this.isRequestInProgressRef.current = false
    }

    if (this.setIsStreamingCallback) {
      this.setIsStreamingCallback(false)
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  /**
   * CRITICAL: Cleanup method for component unmount
   * Ensures locks are released when component unmounts
   */
  cleanup(): void {
    debugLogger.info('[StreamingManager]', 'Cleanup called - releasing all locks')
    this.releaseLocks('Component unmount or cleanup')
  }

  /**
   * Start streaming conversation with comprehensive retry logic
   *
   * @param sessionId - Unique session identifier
   * @param userInput - User input message
   * @param userId - Optional user identifier
   * @param callbacks - Callback functions for state management
   * @param onEvent - Event handler function
   * @param onError - Error handler function
   * @param attempt - Current retry attempt (internal)
   */
  async startStreaming(
    sessionId: string,
    userInput: string,
    userId: string | undefined,
    callbacks: StreamingManagerCallbacks,
    onEvent: (event: any) => void,
    onError: (error: Error) => void,
    attempt: number = 0
  ): Promise<void> {
    // Check if request is already in progress
    if (!userInput.trim() || this.requestIdRef.current) {
      if (this.requestIdRef.current) {
        debugLogger.warn('[StreamingManager]', 'Request already in progress', {
          existingRequestId: this.requestIdRef.current,
          sessionId,
        })
        chatLogger.warn('Request already in progress', {
          currentRequestId: this.requestIdRef.current,
          sessionId,
        })
      }
      return
    }

    // Request deduplication - Generate new request ID
    const requestId = `${sessionId}_${Date.now()}`
    this.requestIdRef.current = requestId

    chatLogger.info('Stream request', {
      sessionId,
      userInput: userInput.substring(0, 30),
      note: 'Using this sessionId for backend communication',
    })

    // Extract business information from user input
    const extractedBusinessModel = callbacks.extractBusinessModelFromInput(userInput)
    const extractedFoundingYear = callbacks.extractFoundingYearFromInput(userInput)

    // Update conversation context if extraction found something
    if (extractedBusinessModel || extractedFoundingYear) {
      const contextUpdate = {
        extracted_business_model: extractedBusinessModel,
        extracted_founding_year: extractedFoundingYear,
        extraction_confidence: {
          business_model: extractedBusinessModel ? 0.8 : 0,
          founding_year: extractedFoundingYear ? 0.8 : 0,
        },
      }
      callbacks.onContextUpdate?.(contextUpdate)
    }

    // CRITICAL FIX: Reset event handler state before starting new stream
    // This ensures hasStartedMessage and messageCreationLock are reset for the new message
    callbacks.onStreamStart?.()

    callbacks.setIsStreaming(true)

    // FIX: User message is already added in handleSubmit, no need to add it again here
    // This prevents duplicate user messages in the UI

    // Message creation is handled by StreamEventHandler.ensureMessageExists() when message_start event arrives
    // This ensures single source of truth and prevents duplicate empty messages

    // CRITICAL FIX: Create AbortController for this request
    this.currentAbortController = new AbortController()
    const abortSignal = this.currentAbortController.signal

    // Add timeout detection
    const timeoutMs = 30000 // 30 seconds
    let timeoutId: NodeJS.Timeout | null = null
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Stream timeout after ${timeoutMs}ms - no response from backend`))
      }, timeoutMs)
    })

    try {
      await Promise.race([
        this.streamWithAsyncGenerator(sessionId, userInput, userId, onEvent, abortSignal),
        timeoutPromise,
      ])
    } catch (error) {
      // CRITICAL FIX: Release locks in catch block BEFORE any retry logic
      // This ensures lock is released even if error handling fails
      const shouldRetry = attempt < 3

      if (!shouldRetry) {
        // Only release locks if not retrying (retry will start new request with new lock)
        this.releaseLocks('Error in stream processing (no retry)', requestId)
      }

      // Check if it's a timeout error
      if (error instanceof Error && error.message.includes('Stream timeout')) {
        debugLogger.error('[StreamingManager]', 'Stream timeout', { error })

        // Show error to user
        callbacks.setIsStreaming(false)

        // Add error message to chat
        callbacks.addMessage({
          type: 'ai',
          content: '⚠️ Connection timeout. The server took too long to respond. Please try again.',
          isComplete: true,
          isStreaming: false,
        })

        throw error
      }

      debugLogger.error('[StreamingManager]', 'Error in streamWithAsyncGenerator', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      chatLogger.error('Async generator error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        userInput: userInput.substring(0, 50) + '...',
        attempt,
        maxRetries: 3,
      })

      // Retry logic with exponential backoff
      if (shouldRetry) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        chatLogger.info('Retrying streaming conversation', {
          attempt: attempt + 1,
          delay,
          sessionId,
        })

        // CRITICAL: Release current locks before retry (retry will set new locks)
        this.releaseLocks('Error in stream processing (will retry)', requestId)

        setTimeout(() => {
          this.startStreaming(
            sessionId,
            userInput,
            userId,
            callbacks,
            onEvent,
            onError,
            attempt + 1
          )
        }, delay)
        return
      }

      // Max retries exceeded - show error message
      callbacks.setIsStreaming(false)
      if (this.currentStreamingMessageRef.current) {
        callbacks.updateStreamingMessage(
          "I apologize, but I'm having trouble connecting. Please try again.",
          true
        )
      }

      onError(error instanceof Error ? error : new Error('Unknown streaming error'))
    } finally {
      // Clean up timeout to prevent memory leak
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      // CRITICAL FIX: Robust lock release in finally block
      // This is the safety net - ensures locks are ALWAYS released
      // Even if catch block is somehow bypassed
      const wasLocked = this.requestIdRef.current !== null
      if (wasLocked) {
        debugLogger.warn('[StreamingManager]', 'Finally block releasing locks (safety net)', {
          requestId,
        })
        this.releaseLocks('Finally block (safety net)', requestId)
      } else {
        debugLogger.log('[StreamingManager]', 'Finally block - locks already released', {
          requestId,
        })
      }
    }
  }

  /**
   * Stream using async generator (primary method)
   * CRITICAL FIX: Added AbortSignal support for proper cleanup
   */
  private async streamWithAsyncGenerator(
    sessionId: string,
    userInput: string,
    userId: string | undefined,
    onEvent: (event: any) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    let eventCount = 0
    let generatorTimeout: NodeJS.Timeout | null = null

    // CRITICAL FIX: Simplified timeout - backend now sends typing event immediately
    // Bank-Grade Principle: Simplicity - Remove complex timeout logic since backend handles it
    // WHAT: Single timeout (60s) to detect complete stream hangs, not per-event timeouts
    // WHY: Backend sends typing event immediately, so we don't need complex first-event logic
    // HOW: Simple timeout that only triggers if stream completely hangs
    // WHEN: When streaming conversation events
    const STREAM_TIMEOUT = 60000 // 60 seconds total timeout (generous since backend sends typing immediately)

    // Set timeout to detect if generator completely hangs
    generatorTimeout = setTimeout(() => {
      chatLogger.warn('Stream timeout - no activity for 60 seconds', { sessionId, eventCount })
      throw new Error('Stream timeout - connection may have been lost')
    }, STREAM_TIMEOUT)

    try {
      // Use streaming service - simple iteration like the old working version
      for await (const event of streamingChatService.streamConversation(
        sessionId,
        userInput,
        userId,
        abortSignal
      )) {
        // CRITICAL FIX: Check if request was aborted
        if (abortSignal?.aborted) {
          chatLogger.info('Stream aborted via AbortSignal', { sessionId })
          if (generatorTimeout) clearTimeout(generatorTimeout)
          throw new Error('Stream aborted')
        }

        // Reset timeout on each event (stream is active)
        if (generatorTimeout) {
          clearTimeout(generatorTimeout)
          generatorTimeout = setTimeout(() => {
            chatLogger.warn('Stream timeout - no activity for 60 seconds', {
              sessionId,
              eventCount,
            })
            throw new Error('Stream timeout - connection may have been lost')
          }, STREAM_TIMEOUT)
        }

        eventCount++

        // DEFENSIVE LOGGING: Track callback execution
        try {
          onEvent(event)
        } catch (callbackError) {
          chatLogger.error('❌ Error in onEvent callback', {
            error: callbackError instanceof Error ? callbackError.message : String(callbackError),
            stack: callbackError instanceof Error ? callbackError.stack : undefined,
            eventType: event.type,
            eventCount,
          })
          throw callbackError
        }
      }

      // Clear timeout on successful completion
      if (generatorTimeout) {
        clearTimeout(generatorTimeout)
        generatorTimeout = null
      }

      chatLogger.debug('Async generator completed', {
        totalEvents: eventCount,
        sessionId,
      })

      // Only throw error if absolutely no events received (shouldn't happen with typing event)
      if (eventCount === 0) {
        chatLogger.warn('No events received from async generator - server may not have responded', {
          sessionId,
        })
        throw new Error('No events received from async generator - server may not have responded')
      }
    } catch (error) {
      if (generatorTimeout) {
        clearTimeout(generatorTimeout)
        generatorTimeout = null
      }
      throw error
    }
  }

  /**
   * Stream using EventSource (fallback method)
   */
  streamWithEventSource(
    sessionId: string,
    userInput: string,
    userId: string | undefined,
    onEvent: (event: any) => void,
    onError: (error: Error) => void,
    onComplete: () => void
  ): EventSource {
    chatLogger.info('Starting EventSource fallback', { sessionId })

    const eventSource = streamingChatService.streamConversationEventSource(
      sessionId,
      userInput,
      userId,
      (event) => {
        chatLogger.info('EventSource event received', {
          type: event.type,
          hasContent: !!event.content,
        })
        onEvent(event)
      },
      (error) => {
        chatLogger.error('EventSource error', { error: error.message })
        onError(error)
      },
      () => {
        chatLogger.info('EventSource completed', { sessionId })
        onComplete()
      }
    )

    return eventSource
  }

  /**
   * Check if a request is currently in progress
   */
  isRequestInProgress(): boolean {
    return this.requestIdRef.current !== null
  }

  /**
   * Get current request ID
   */
  getCurrentRequestId(): string | null {
    return this.requestIdRef.current
  }

  /**
   * Clear current request (useful for cleanup)
   * CRITICAL FIX: Uses releaseLocks for robust cleanup
   */
  clearCurrentRequest(): void {
    this.releaseLocks('Manual clearCurrentRequest call')
  }

  /**
   * Get current streaming message
   */
  getCurrentStreamingMessage(): Message | null {
    return this.currentStreamingMessageRef.current
  }

  /**
   * Set current streaming message
   */
  setCurrentStreamingMessage(message: Message | null): void {
    this.currentStreamingMessageRef.current = message
  }
}
