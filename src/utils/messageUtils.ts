/**
 * Message Utilities
 *
 * Reusable utilities for message validation, creation, and manipulation.
 * Extracted from StreamingChat to improve maintainability and testability.
 */

import { generalLogger } from './logger'
import { createRandomId } from './secureRandom'

export interface Message {
  id: string
  type: 'user' | 'ai' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
  isComplete?: boolean
  metadata?: unknown
}

/**
 * Type guard to ensure message is valid
 */
export const isValidMessage = (msg: unknown): msg is Message => {
  return (
    msg !== null &&
    msg !== undefined &&
    typeof msg === 'object' &&
    'id' in msg &&
    'type' in msg &&
    'content' in msg
  )
}

/**
 * Create a new message with proper defaults
 */
export const createMessage = (
  type: 'user' | 'ai' | 'system',
  content: string,
  metadata?: unknown
): Message => ({
  id: createRandomId('msg', 12),
  type,
  content,
  timestamp: new Date(),
  isComplete: true,
  isStreaming: false,
  metadata,
})

/**
 * Create a streaming message (incomplete)
 */
export const createStreamingMessage = (
  type: 'user' | 'ai' | 'system',
  content: string = '',
  metadata?: unknown
): Message => ({
  id: createRandomId('msg', 12),
  type,
  content,
  timestamp: new Date(),
  isComplete: false,
  isStreaming: true,
  metadata,
})

/**
 * Complete a streaming message
 */
export const completeMessage = (message: Message): Message => ({
  ...message,
  isComplete: true,
  isStreaming: false,
})

/**
 * Update message content (for streaming)
 */
export const updateMessageContent = (message: Message, content: string): Message => ({
  ...message,
  content,
})

/**
 * Filter valid messages from an array
 */
export const filterValidMessages = (messages: unknown[]): Message[] => {
  return messages.filter(isValidMessage)
}

/**
 * Ensure messages array contains only valid messages
 * Logs warnings for invalid messages found
 */
export const ensureValidMessages = (messages: unknown[]): Message[] => {
  const validMessages: Message[] = []
  messages.forEach((msg, index) => {
    if (isValidMessage(msg)) {
      validMessages.push(msg)
    } else {
      generalLogger.warn(`Invalid message at index ${index}`, { message: msg })
    }
  })

  if (validMessages.length !== messages.length) {
    generalLogger.warn(`Filtered out invalid messages`, {
      totalMessages: messages.length,
      validMessages: validMessages.length,
      filteredCount: messages.length - validMessages.length,
    })
  }

  return validMessages
}

/**
 * Safe message array update that prevents nulls
 */
export const safeUpdateMessages = (
  currentMessages: Message[],
  updateFn: (messages: Message[]) => Message[]
): Message[] => {
  const validCurrent = ensureValidMessages(currentMessages)
  const updated = updateFn(validCurrent)
  return ensureValidMessages(updated)
}
