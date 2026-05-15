import type { ChatMessage } from '@/components/calculator'

interface BuildManualAssistantChatMessageParams {
  id: string
  content?: string
  isError?: boolean
  timestamp?: Date
}

interface BuildManualSystemChatMessageParams {
  id: string
  content: string
  timestamp?: Date
}

interface BuildManualUserChatMessageParams<TAttachment extends { name: string; type: string }> {
  id: string
  content: string
  attachments?: readonly TAttachment[]
  createObjectUrl?: (attachment: TAttachment) => string
  timestamp?: Date
}

export function buildManualAssistantChatMessage({
  id,
  content = '',
  isError,
  timestamp = new Date(),
}: BuildManualAssistantChatMessageParams): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    timestamp,
    ...(isError !== undefined ? { isError } : {}),
  }
}

export function buildManualSystemChatMessage({
  id,
  content,
  timestamp = new Date(),
}: BuildManualSystemChatMessageParams): ChatMessage {
  return {
    id,
    role: 'system',
    content,
    timestamp,
  }
}

export function buildManualUserChatMessage<TAttachment extends { name: string; type: string }>({
  id,
  content,
  attachments,
  createObjectUrl = () => '',
  timestamp = new Date(),
}: BuildManualUserChatMessageParams<TAttachment>): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    timestamp,
    attachments: attachments?.map((attachment) => ({
      name: attachment.name,
      type: attachment.type,
      url: createObjectUrl(attachment),
    })),
  }
}

export function patchManualChatMessage(
  messages: readonly ChatMessage[],
  messageId: string,
  patch: Partial<ChatMessage>
): ChatMessage[] {
  return messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message))
}
