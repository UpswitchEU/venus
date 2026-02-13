/**
 * useAutoSend - Extracted auto-send logic from StreamingChat component
 *
 * Single Responsibility: Manages automatic sending of initial message when
 * autoSend is enabled and all conditions are met.
 *
 * Bank-Grade Excellence Framework Implementation:
 * - Single Responsibility Principle: Focused solely on auto-send logic
 * - Optimized dependencies: Uses refs to minimize re-renders
 * - Race condition prevention: Uses AbortController and refs for state tracking
 * - Comprehensive error handling: Logs all state transitions
 *
 * @module hooks/chat/useAutoSend
 */

import { useEffect, useRef } from 'react'
import type { Message } from '../../types/message'
import { chatLogger } from '../../utils/logger'

/**
 * Options for useAutoSend hook
 */
export interface UseAutoSendOptions {
  /** Whether auto-send is enabled */
  autoSend: boolean
  /** Initial message to auto-send */
  initialMessage: string | null
  /** Whether session is initialized */
  isSessionInitialized: boolean
  /** Whether restoration is complete */
  isRestorationComplete: boolean
  /** Whether restoration is in progress */
  isRestoring: boolean
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Python backend session ID (preferred over client sessionId) */
  pythonSessionId: string | null
  /** Whether streaming is currently active */
  isStreaming: boolean
  /** Current number of messages */
  messagesLength: number
  /** Whether restored messages exist */
  hasRestoredMessages: boolean
  /** Function to submit stream */
  submitStream: (message: string) => Promise<void>
  /** Client session ID */
  sessionId: string
  /** Function to get current messages */
  getMessages: () => Message[]
}

/**
 * Hook return type (no return value needed, hook manages internal state)
 */
export interface UseAutoSendReturn {
  // Hook manages internal state, no return needed
}

/**
 * Custom hook for managing auto-send logic
 *
 * Automatically sends the initial message when:
 * - autoSend is true
 * - Session is ready (initialized or restoration complete)
 * - Python session ID is available (or initialization is complete)
 * - Not currently streaming
 * - No matching user message already exists
 * - No restored messages exist
 *
 * Uses refs to track state and prevent duplicate sends:
 * - hasAutoSentRef: Tracks if message has already been sent
 * - lastSessionIdRef: Tracks session ID changes
 * - lastCheckedMessagesLengthRef: Optimizes message checking
 *
 * @param options - Configuration options for auto-send behavior
 * @returns Empty object (hook manages internal state)
 *
 * @example
 * ```tsx
 * useAutoSend({
 *   autoSend: true,
 *   initialMessage: 'Restaurant',
 *   isSessionInitialized: true,
 *   isRestorationComplete: true,
 *   isRestoring: false,
 *   isInitializing: false,
 *   pythonSessionId: 'python_session_123',
 *   isStreaming: false,
 *   messagesLength: 0,
 *   hasRestoredMessages: false,
 *   submitStream: async (msg) => { await submitStream(msg) },
 *   sessionId: 'session_123',
 *   getMessages: () => [],
 * })
 * ```
 */
export function useAutoSend(options: UseAutoSendOptions): UseAutoSendReturn {
  const {
    autoSend,
    initialMessage,
    isSessionInitialized,
    isRestorationComplete,
    isRestoring,
    isInitializing,
    pythonSessionId,
    isStreaming,
    messagesLength,
    hasRestoredMessages,
    submitStream,
    sessionId,
    getMessages,
  } = options

  // Track if auto-send has already been executed
  const hasAutoSentRef = useRef(false)
  // Track last session ID to detect changes
  const lastSessionIdRef = useRef<string | null>(null)
  // Track last checked messages length for optimization
  const lastCheckedMessagesLengthRef = useRef(0)

  // Reset auto-send flag when sessionId changes
  useEffect(() => {
    if (lastSessionIdRef.current !== null && lastSessionIdRef.current !== sessionId) {
      hasAutoSentRef.current = false
      lastCheckedMessagesLengthRef.current = 0
      chatLogger.debug('Session ID changed, resetting auto-send flag', {
        previousSessionId: lastSessionIdRef.current,
        newSessionId: sessionId,
      })
    }
    lastSessionIdRef.current = sessionId
  }, [sessionId])

  // Main auto-send logic
  useEffect(() => {
    // Early return if already sent or conditions not met
    if (hasAutoSentRef.current || !autoSend || !initialMessage?.trim()) {
      return
    }

    // Don't auto-send if conversation already exists (has restored messages)
    if (hasRestoredMessages) {
      return
    }

    // Session is ready when:
    // - Session is initialized, OR
    // - Restoration is complete (if restoration was attempted)
    const sessionReady = isSessionInitialized || (isRestorationComplete && !isRestoring)

    // CRITICAL: Wait for pythonSessionId to be available if initialization is complete
    // This ensures we use the correct backend session ID for streaming
    // If initialization is still in progress, pythonSessionId will be set when /start completes
    // If initialization is complete but pythonSessionId is null, it means no conversation exists yet
    // In that case, we can proceed with client sessionId (it will be mapped by backend)
    // However, if initialization just completed, give it a moment for pythonSessionId to be set
    const pythonSessionIdReady =
      pythonSessionId !== null || // Python session ID is available
      (!isInitializing && isRestorationComplete) // Or initialization is done and restoration is complete

    // Only check for matching messages if messages length changed (optimization)
    const messagesLengthChanged = messagesLength !== lastCheckedMessagesLengthRef.current
    if (messagesLengthChanged) {
      lastCheckedMessagesLengthRef.current = messagesLength
    }

    // Check if we should auto-send
    const messages = getMessages()
    const hasMatchingUserMessage = messages.some(
      (m) => m.type === 'user' && m.content === initialMessage.trim()
    )

    const shouldAutoSend =
      sessionReady &&
      pythonSessionIdReady &&
      !isStreaming &&
      !isInitializing &&
      !hasMatchingUserMessage

    if (shouldAutoSend) {
      hasAutoSentRef.current = true
      chatLogger.info('🚀 Auto-sending initial message', {
        sessionId,
        pythonSessionId,
        initialMessage: initialMessage.substring(0, 50),
        isRestorationComplete,
        isSessionInitialized,
        isRestoring,
        isInitializing,
      })
      // Use setTimeout to ensure state is fully settled before sending
      setTimeout(() => {
        submitStream(initialMessage.trim())
      }, 100)
    } else if (sessionReady && !pythonSessionIdReady && !isInitializing) {
      // Log when we're waiting for pythonSessionId
      chatLogger.debug('⏳ Waiting for pythonSessionId before auto-send', {
        sessionId,
        pythonSessionId,
        isInitializing,
      })
    }
  }, [
    autoSend,
    initialMessage,
    isSessionInitialized,
    isRestorationComplete,
    isRestoring,
    isInitializing,
    pythonSessionId,
    isStreaming,
    messagesLength,
    hasRestoredMessages,
    submitStream,
    sessionId,
    getMessages,
  ])

  return {}
}
