import type { ChatMessage } from '@/components/calculator'
import type { Message } from '@/types/message'
import { createRandomId } from '@/utils/secureRandom'
import {
  appendManualChatToolCardsToMessage,
  parseManualChatStreamToolResult,
} from './manualChatToolCards'

interface PersistedToolResult {
  toolName: string
  result: unknown
}

function createManualChatCardId(): string {
  return createRandomId('card', 12)
}

function resolveManualChatRole(message: Message): ChatMessage['role'] {
  if (message.role === 'user' || message.role === 'assistant' || message.role === 'system') {
    return message.role
  }

  if (message.type === 'ai') return 'assistant'
  if (message.type === 'user') return 'user'
  return 'system'
}

function getPersistedToolResults(message: Message): PersistedToolResult[] {
  const results = message.metadata?.persistedToolResults
  if (!Array.isArray(results)) return []

  return results
    .map((result) => {
      const toolName = typeof result.toolName === 'string' ? result.toolName.trim() : ''
      if (!toolName) return null
      return {
        toolName,
        result: result.result,
      }
    })
    .filter((result): result is PersistedToolResult => Boolean(result))
}

export function mapStoredMessageToManualChatMessage(
  message: Message,
  createId: () => string = createManualChatCardId
): ChatMessage {
  let chatMessage: ChatMessage = {
    id: message.id,
    role: resolveManualChatRole(message),
    content: message.content,
    timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
  }

  for (const persistedToolResult of getPersistedToolResults(message)) {
    const cards = parseManualChatStreamToolResult(
      persistedToolResult.toolName,
      persistedToolResult.result,
      createId
    )
    if (cards) {
      chatMessage = appendManualChatToolCardsToMessage(chatMessage, cards)
    }
  }

  return chatMessage
}

export function mapStoredMessagesToManualChatMessages(
  messages: readonly Message[],
  createId: () => string = createManualChatCardId
): ChatMessage[] {
  return messages.map((message) => mapStoredMessageToManualChatMessage(message, createId))
}
