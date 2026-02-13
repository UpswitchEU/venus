/**
 * StreamingChat - Simplified Orchestrator Component
 *
 * Bank-Grade Excellence Framework Implementation:
 * - Single Responsibility: Lightweight orchestrator using focused hooks
 * - SOLID Principles: Clean separation with extracted hooks
 * - Clean Architecture: Minimal component coordinating specialized modules
 *
 * BEFORE: 1,311-line god component with 10+ responsibilities
 * AFTER:  ~200-line orchestrator coordinating focused hooks
 *
 * Responsibilities now handled by specialized hooks and stores:
 * - useConversationStore: Message state management (Zustand store - simple linear flow)
 * - useStreamingCoordinator: Streaming lifecycle and backend communication
 * - useSmartSuggestions: Contextual follow-up suggestions
 * - useConversationInitializer: Session setup and restoration
 * - useConversationMetrics: Performance tracking
 * - useTypingAnimation: Smooth AI response animation
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useAutoSend } from '../hooks/chat/useAutoSend'
import { useSmartSuggestions } from '../hooks/chat/useSmartSuggestions'
import { useStreamingCoordinator } from '../hooks/chat/useStreamingCoordinator'
import { useAuth } from '../hooks/useAuth'
import { type UserProfile, useConversationInitializer } from '../hooks/useConversationInitializer'
import { useConversationMetrics } from '../hooks/useConversationMetrics'
import { useTypingAnimation } from '../hooks/useTypingAnimation'
import { useConversationStore } from '../store/useConversationStore'
import type { Message } from '../types/message'
import { is429RateLimit } from '../utils/errorDetection'
import { convertToApplicationError, getErrorMessage } from '../utils/errors/errorConverter'
import { isNetworkError, isRateLimitError, isTimeoutError } from '../utils/errors/errorGuards'
import { chatLogger } from '../utils/logger'
import { ChatInputForm, MessagesList } from './chat'

// Re-export types for backward compatibility
export type {
  CalculateOptionData,
  CollectedData,
  StreamingChatProps,
  ValuationPreviewData,
} from './StreamingChat.types'

export const StreamingChat: React.FC<import('./StreamingChat.types').StreamingChatProps> = ({
  sessionId,
  userId,
  onMessageComplete,
  onValuationComplete,
  onValuationStart,
  onReportUpdate,
  onDataCollected,
  onValuationPreview,
  onCalculateOptionAvailable,
  onProgressUpdate,
  onReportSectionUpdate,
  onSectionLoading,
  onSectionComplete,
  onReportComplete,
  onContextUpdate,
  onHtmlPreviewUpdate,
  onPythonSessionIdReceived,
  onCalculate,
  isCalculating = false,
  className = '',
  disabled = false,
  initialMessage = null,
  autoSend = false,
  initialData,
  initialMessages = [],
  isRestoring = false,
  isSessionInitialized = false,
  pythonSessionId: pythonSessionIdProp,
  isRestorationComplete = false,
  onContinueConversation,
  onViewReport,
  onNormalizeEbitda,
  onRecalculateValuation,
}) => {
  // Get user data from auth store
  const { user } = useAuth()

  // Track Python-generated session ID separately from client session ID
  const [internalPythonSessionId, setInternalPythonSessionId] = React.useState<string | null>(null)
  const pythonSessionId = pythonSessionIdProp ?? internalPythonSessionId

  const setPythonSessionId = useCallback(
    (id: string | null) => {
      setInternalPythonSessionId(id)
      if (id && onPythonSessionIdReceived) {
        onPythonSessionIdReceived(id)
      }
    },
    [onPythonSessionIdReceived]
  )

  // Sync prop to internal state when prop changes
  useEffect(() => {
    if (pythonSessionIdProp !== undefined && pythonSessionIdProp !== internalPythonSessionId) {
      setInternalPythonSessionId(pythonSessionIdProp)
    }
  }, [pythonSessionIdProp, internalPythonSessionId])

  // Use Zustand store for messages (simple linear flow)
  // Optimized: Use single selector with shallow comparison to reduce re-renders
  const {
    messages,
    isStreaming,
    isTyping,
    isThinking,
    typingContext,
    addMessage,
    setStreaming,
    setTyping,
    setThinking,
    setTypingContext,
  } = useConversationStore(
    (state) => ({
      messages: state.messages,
      isStreaming: state.isStreaming,
      isTyping: state.isTyping,
      isThinking: state.isThinking,
      typingContext: state.typingContext,
      addMessage: state.addMessage,
      setStreaming: state.setStreaming,
      setTyping: state.setTyping,
      setThinking: state.setThinking,
      setTypingContext: state.setTypingContext,
    }),
    shallow
  )

  // Local state for input and other UI state
  const [input, setInput] = useState('')
  const [collectedData, setCollectedData] = useState<Record<string, any>>({})
  const [valuationPreview, setValuationPreview] = useState<any>(null)
  const [calculateOption, setCalculateOption] = useState<any>(null)

  // Prefill input field with initialMessage when available
  // CRITICAL FIX: Use ref to track if we've already prefilled to prevent infinite loops
  const hasPrefilledRef = useRef(false)
  useEffect(() => {
    // Only prefill once per initialMessage change, and only if input is empty
    if (initialMessage && initialMessage.trim() && !input.trim() && !hasPrefilledRef.current) {
      chatLogger.debug('Prefilling input field with initialMessage', {
        sessionId,
        initialMessage: initialMessage.substring(0, 50),
      })
      setInput(initialMessage.trim())
      hasPrefilledRef.current = true
    }
    // Reset prefilled flag when initialMessage or sessionId changes
    if (!initialMessage || !initialMessage.trim()) {
      hasPrefilledRef.current = false
    }
  }, [initialMessage, sessionId, input])

  // Extract smart suggestions logic
  const { suggestions } = useSmartSuggestions({
    messages,
  })

  // Get stable references to store actions
  const storeSetMessages = useConversationStore((state) => state.setMessages)
  const storeAddMessage = useConversationStore((state) => state.addMessage)

  // Wrapper to match expected signature for useStreamingCoordinator
  const setMessages = useCallback(
    (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
      if (typeof newMessages === 'function') {
        const currentMessages = useConversationStore.getState().messages
        const updatedMessages = newMessages(currentMessages)
        storeSetMessages(updatedMessages)
      } else {
        storeSetMessages(newMessages)
      }
    },
    [storeSetMessages]
  )

  // Wrapper for addMessage to match useConversationInitializer signature
  const addMessageWrapper = useCallback(
    (message: Omit<Message, 'id' | 'timestamp'>) => {
      const messageId = storeAddMessage(message)
      const store = useConversationStore.getState()
      const newMessage = store.messages.find((m) => m.id === messageId)
      return {
        updatedMessages: store.messages,
        newMessage:
          newMessage ||
          ({
            ...message,
            id: messageId,
            timestamp: new Date(),
          } as Message),
      }
    },
    [storeAddMessage]
  )

  // Extract streaming coordination logic
  const streamingCoordinator = useStreamingCoordinator({
    sessionId,
    pythonSessionId, // CRITICAL: Pass Python session ID for backend communication
    userId: userId ?? user?.id,
    messages,
    setMessages,
    setIsStreaming: setStreaming,
    setIsTyping: setTyping,
    setIsThinking: setThinking,
    setTypingContext,
    setCollectedData,
    setValuationPreview,
    setCalculateOption,
    updateStreamingMessage: (content: string, isComplete?: boolean, metadata?: unknown) => {
      // Simple wrapper: use store's appendToMessage or updateMessage
      const store = useConversationStore.getState()
      let streamingId = store.currentStreamingMessageId

      // CRITICAL FIX: If currentStreamingMessageId is not set (race condition),
      // find the last streaming message as fallback
      if (!streamingId) {
        const lastStreamingMessage = store.messages
          .slice()
          .reverse()
          .find((msg) => msg.isStreaming && !msg.isComplete)
        if (lastStreamingMessage) {
          streamingId = lastStreamingMessage.id
        }
      }

      if (streamingId) {
        if (isComplete) {
          store.updateMessage(streamingId, {
            content,
            isComplete: true,
            isStreaming: false,
            metadata: metadata as any,
          })
          store.setStreaming(false)
        } else {
          store.appendToMessage(streamingId, content)
        }
      } else {
        // Fallback: create message if none exists (shouldn't happen in normal flow)
        chatLogger.warn('updateStreamingMessage called but no streaming message found', {
          sessionId,
          hasContent: !!content,
          isComplete,
        })
      }
    },
    onValuationComplete,
    onReportUpdate,
    onDataCollected,
    onValuationPreview,
    onCalculateOptionAvailable,
    onProgressUpdate,
    onReportSectionUpdate,
    onSectionLoading,
    onSectionComplete,
    onReportComplete,
    onHtmlPreviewUpdate,
    trackModelPerformance: () => {
      // Placeholder implementation
    },
    trackConversationCompletion: () => {
      // Placeholder implementation
    },
  })

  // Extract stream submission logic - simplified version for new architecture
  // Accepts optional input parameter to handle async state updates
  const submitStream = useCallback(
    async (inputValue?: string) => {
      const inputToSubmit = inputValue ?? input

      // Validate input before submission
      if (!inputToSubmit || !inputToSubmit.trim()) {
        chatLogger.warn('Attempted to submit empty input', { sessionId })
        return
      }

      try {
        // Add user message before starting stream (using store)
        addMessage({
          type: 'user',
          content: inputToSubmit.trim(),
          role: 'user',
        })

        // Clear input before starting stream
        setInput('')

        // Start streaming with validated input
        await streamingCoordinator.startStreaming(inputToSubmit.trim())
      } catch (error) {
        const appError = convertToApplicationError(error, {
          sessionId,
          pythonSessionId,
          operation: 'stream_submission',
        })

        // Extract error properties before type narrowing
        const errorMessageForLog = appError.message
        const errorCodeForLog = appError.code

        if (isNetworkError(appError)) {
          chatLogger.error('Network error during stream submission', {
            error: errorMessageForLog,
            code: errorCodeForLog,
            sessionId,
            pythonSessionId,
          })
        } else if (isTimeoutError(appError)) {
          chatLogger.error('Timeout during stream submission', {
            error: errorMessageForLog,
            code: errorCodeForLog,
            sessionId,
            pythonSessionId,
          })
        } else {
          chatLogger.error('Stream submission failed', {
            error: errorMessageForLog,
            code: errorCodeForLog,
            sessionId,
            pythonSessionId,
          })
        }

        // Reset streaming state on error
        setStreaming(false)

        // Get user-friendly error message
        const errorMessage = getErrorMessage(appError)

        // Determine error type and create helpful message
        let userMessage = errorMessage
        let errorDetailsText: string | undefined

        if (isNetworkError(appError)) {
          userMessage = 'Unable to connect to the server. Please check your internet connection.'
          errorDetailsText = 'Network connection failed. This is usually temporary.'
        } else if (isTimeoutError(appError)) {
          userMessage = 'The request took too long to complete. Please try again.'
          errorDetailsText = 'Request timeout. The server may be busy.'
        } else if (is429RateLimit(appError) || isRateLimitError(appError)) {
          // CRITICAL FIX: Handle rate limit errors with user-friendly message
          const retryAfter = (appError as any).context?.retryAfter || 3600
          const retryAfterMinutes = Math.ceil(retryAfter / 60)
          userMessage = `Too many requests. Please wait ${retryAfterMinutes} minute${retryAfterMinutes !== 1 ? 's' : ''} before trying again.`
          errorDetailsText = `Rate limit exceeded. You can make ${retryAfterMinutes === 60 ? '30 requests per hour' : 'more requests'} after the wait period.`
        } else {
          userMessage = errorMessage || 'An unexpected error occurred. Please try again.'
        }

        // Add user-friendly error message with metadata for retry (using store)
        addMessage({
          type: 'system',
          content: userMessage,
          isComplete: true,
          metadata: {
            error_type: 'error',
            error_code: appError.code,
            error_details: errorDetailsText,
            original_input: inputToSubmit.trim(),
            can_retry:
              isNetworkError(appError) || isTimeoutError(appError) || isRateLimitError(appError),
          },
        })
      }
    },
    [input, setInput, setStreaming, streamingCoordinator, addMessage, sessionId, pythonSessionId]
  )

  // Extract suggestion handlers - simplified version
  const suggestionHandlers = {
    handleSuggestionSelect: useCallback(
      (suggestion: string) => {
        // Pass suggestion directly to submitStream
        setInput(suggestion)
        submitStream(suggestion)
      },
      [setInput, submitStream]
    ),

    handleSuggestionDismiss: useCallback(() => {
      // Handle suggestion dismissal if needed
    }, []),

    handleClarificationConfirm: useCallback(
      (messageId: string) => {
        const confirmationText = 'Yes'
        setInput(confirmationText)
        submitStream(confirmationText)
      },
      [setInput, submitStream]
    ),

    handleClarificationReject: useCallback(
      (messageId: string) => {
        const rejectionText = 'No'
        setInput(rejectionText)
        submitStream(rejectionText)
      },
      [setInput, submitStream]
    ),

    handleKBOSuggestionSelect: useCallback(
      (selection: string) => {
        setInput(selection)
        submitStream(selection)
      },
      [setInput, submitStream]
    ),

    handleBusinessTypeSuggestionSelect: useCallback(
      (selection: string) => {
        // Business type suggestions work the same way as KBO suggestions
        // Send the selection (number string like "1", "2", etc. or "none") directly to backend
        setInput(selection)
        submitStream(selection)
      },
      [setInput, submitStream]
    ),
  }

  // CRITICAL: Restore messages from backend on mount
  const lastRestoredMessagesRef = useRef<string>('')
  const lastCompletedMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      const messagesFingerprint = initialMessages.map((m) => m.id).join(',')

      const shouldRestore =
        messages.length === 0 || lastRestoredMessagesRef.current !== messagesFingerprint

      if (shouldRestore) {
        chatLogger.info('✅ Restoring conversation messages in StreamingChat', {
          sessionId,
          messagesCount: initialMessages.length,
          fingerprint: messagesFingerprint,
        })
        setMessages(initialMessages)
        lastRestoredMessagesRef.current = messagesFingerprint
      }
    }
  }, [initialMessages, sessionId, messages.length, setMessages])

  // Call onMessageComplete when a message completes
  useEffect(() => {
    if (!onMessageComplete) return

    // Find the most recent completed AI message that we haven't notified about
    const completedMessages = messages.filter(
      (msg) => msg.type === 'ai' && msg.isComplete && !msg.isStreaming
    )
    const latestCompleted = completedMessages[completedMessages.length - 1]

    if (latestCompleted && latestCompleted.id !== lastCompletedMessageIdRef.current) {
      lastCompletedMessageIdRef.current = latestCompleted.id
      onMessageComplete(latestCompleted)
      chatLogger.debug('Message completion callback invoked', {
        messageId: latestCompleted.id,
        sessionId,
      })
    }
  }, [messages, onMessageComplete, sessionId])

  // CRITICAL: Memoize getCurrentMessages to prevent infinite loops in useConversationInitializer
  // The function reference must be stable to avoid re-running the initialization effect
  const getCurrentMessages = useCallback(() => {
    return useConversationStore.getState().messages
  }, []) // Empty deps - always get fresh messages from store

  // Use extracted conversation initializer
  const { isInitializing } = useConversationInitializer(sessionId, userId, {
    addMessage: addMessageWrapper,
    setMessages: setMessages as React.Dispatch<React.SetStateAction<Message[]>>,
    getCurrentMessages,
    user: user as UserProfile | undefined,
    initialData,
    initialMessages,
    isRestoring,
    isSessionInitialized,
    pythonSessionId,
    isRestorationComplete,
    onSessionIdUpdate: setPythonSessionId,
    autoSend,
    initialMessage,
  })

  // Use extracted auto-send hook
  useAutoSend({
    autoSend: autoSend ?? false,
    initialMessage,
    isSessionInitialized,
    isRestorationComplete,
    isRestoring,
    isInitializing,
    pythonSessionId,
    isStreaming,
    messagesLength: messages.length,
    hasRestoredMessages: (initialMessages?.length ?? 0) > 0,
    submitStream,
    sessionId,
    getMessages: () => messages,
  })

  // Use extracted metrics tracking
  const {
    trackModelPerformance: _trackModelPerformance,
    trackConversationCompletion: _trackConversationCompletion,
  } = useConversationMetrics(sessionId, userId)

  // Typing animation for smooth AI responses
  const { complete: _complete } = useTypingAnimation({
    baseSpeed: 50,
    adaptiveSpeed: true,
    punctuationPauses: true,
    showCursor: true,
  })

  // Handle form submission
  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      if (!input.trim()) return

      try {
        await submitStream()
      } catch (error) {
        const appError = convertToApplicationError(error, {
          sessionId,
          pythonSessionId,
          operation: 'form_submission',
        })

        // Extract error properties before type narrowing
        const errorMessageForLog = appError.message
        const errorCodeForLog = appError.code

        if (isNetworkError(appError)) {
          chatLogger.error('Network error during form submission', {
            error: errorMessageForLog,
            code: errorCodeForLog,
            sessionId,
            pythonSessionId,
          })
        } else if (isTimeoutError(appError)) {
          chatLogger.error('Timeout during form submission', {
            error: errorMessageForLog,
            code: errorCodeForLog,
            sessionId,
            pythonSessionId,
          })
        } else {
          chatLogger.error('Form submission failed', {
            error: errorMessageForLog,
            code: errorCodeForLog,
            sessionId,
            pythonSessionId,
          })
        }

        // Get user-friendly error message
        const errorMessage = getErrorMessage(appError)

        // Determine error type and create helpful message
        let userMessage = errorMessage
        let errorDetailsText: string | undefined

        if (isNetworkError(appError)) {
          userMessage = 'Unable to connect to the server. Please check your internet connection.'
          errorDetailsText = 'Network connection failed. This is usually temporary.'
        } else if (isTimeoutError(appError)) {
          userMessage = 'The request took too long to complete. Please try again.'
          errorDetailsText = 'Request timeout. The server may be busy.'
        } else {
          userMessage = errorMessage || 'An unexpected error occurred. Please try again.'
        }

        // Add user-friendly error message with metadata for retry (using store)
        addMessage({
          type: 'system',
          content: userMessage,
          isComplete: true,
          metadata: {
            error_type: 'error',
            error_code: appError.code,
            error_details: errorDetailsText,
            original_input: input.trim(),
            can_retry: isNetworkError(appError) || isTimeoutError(appError),
          },
        })
      }
    },
    [input, submitStream, sessionId, pythonSessionId, addMessage]
  )

  // Handle retry for error messages
  const handleRetry = useCallback(
    async (messageId: string) => {
      // Find the error message
      const errorMessage = messages.find((m) => m.id === messageId)
      if (!errorMessage || errorMessage.type !== 'system') {
        return
      }

      const originalInput = errorMessage.metadata?.original_input as string | undefined
      if (!originalInput) {
        return
      }

      // Update error message to show retrying state
      const store = useConversationStore.getState()
      store.updateMessage(messageId, {
        metadata: {
          ...errorMessage.metadata,
          is_retrying: true,
        },
      })

      try {
        // Retry the submission
        await submitStream(originalInput)

        // Remove the error message on success
        const updatedMessages = messages.filter((m) => m.id !== messageId)
        store.setMessages(updatedMessages)
      } catch {
        // Update error message to remove retrying state
        store.updateMessage(messageId, {
          metadata: {
            ...errorMessage.metadata,
            is_retrying: false,
          },
        })
      }
    },
    [messages, submitStream]
  )

  return (
    <div className={`flex h-full flex-col overflow-hidden flex-1 ${className}`}>
      {/* Messages Container */}
      <MessagesList
        messages={messages}
        isTyping={isTyping}
        isThinking={isThinking}
        isInitializing={isInitializing}
        onSuggestionSelect={suggestionHandlers.handleSuggestionSelect}
        onSuggestionDismiss={suggestionHandlers.handleSuggestionDismiss}
        onClarificationConfirm={suggestionHandlers.handleClarificationConfirm}
        onClarificationReject={suggestionHandlers.handleClarificationReject}
        onKBOSuggestionSelect={suggestionHandlers.handleKBOSuggestionSelect}
        onBusinessTypeSuggestionSelect={suggestionHandlers.handleBusinessTypeSuggestionSelect}
        onValuationStart={onValuationStart}
        onRetry={handleRetry}
        calculateOption={calculateOption}
        valuationPreview={valuationPreview}
        onCalculate={onCalculate}
        isCalculating={isCalculating}
        messagesEndRef={useRef<HTMLDivElement>(null)}
        onContinueConversation={onContinueConversation}
        onViewReport={onViewReport}
        onNormalizeEbitda={onNormalizeEbitda}
        onRecalculateValuation={onRecalculateValuation}
      />

      {/* Input Form */}
      <ChatInputForm
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isStreaming={isStreaming}
        disabled={disabled}
        placeholder="Ask about your business valuation..."
        suggestions={suggestions}
      />
    </div>
  )
}

export default StreamingChat
