import type { AiStreamChunk } from '@upswitch/ai-actions'

export interface TitanChatJsonResponse {
  success?: boolean
  content?: string
  conversationId?: string
  toolResults?: Array<{
    type?: string
    toolName?: string
    data?: unknown
  }>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    estimatedCost?: number
  }
  aiCredits?: {
    remaining: number
    limit: number
  }
}

function encodeSseChunk(chunk: AiStreamChunk): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
}

export function isVisibleAiStreamChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') return false
  const typed = chunk as {
    type?: string
    content?: string
    toolResult?: unknown
    error?: string
  }
  switch (typed.type) {
    case 'text':
      return typeof typed.content === 'string' && typed.content.trim().length > 0
    case 'tool_result':
      return typed.toolResult !== undefined
    case 'error':
      return typeof typed.error === 'string' && typed.error.trim().length > 0
    default:
      return false
  }
}

export function sseBytesContainVisibleContent(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes)
  for (const frame of text.split(/\r?\n\r?\n/)) {
    const trimmed = frame.trim()
    if (!trimmed) continue
    const dataLine = trimmed.split(/\r?\n/).find((line) => line.startsWith('data:'))
    if (!dataLine) continue
    const json = dataLine.slice(5).trim()
    if (!json || json === '[DONE]') continue
    try {
      if (isVisibleAiStreamChunk(JSON.parse(json))) return true
    } catch {
      continue
    }
  }
  return false
}

export function encodeTitanChatResponseAsSseBytes(response: TitanChatJsonResponse): Uint8Array[] {
  const chunks: Uint8Array[] = []
  const conversationId =
    typeof response.conversationId === 'string' && response.conversationId.trim().length > 0
      ? response.conversationId.trim()
      : undefined

  if (conversationId) {
    chunks.push(
      encodeSseChunk({
        type: 'text',
        content: '',
        conversationId,
      })
    )
  }

  const content = typeof response.content === 'string' ? response.content : ''
  if (content.length > 0) {
    chunks.push(
      encodeSseChunk({
        type: 'text',
        content,
        ...(conversationId ? { conversationId } : {}),
      })
    )
  }

  for (const toolResult of response.toolResults ?? []) {
    const toolName =
      typeof toolResult.toolName === 'string' && toolResult.toolName.trim().length > 0
        ? toolResult.toolName.trim()
        : null
    if (!toolName || toolResult.data === undefined) continue

    chunks.push(
      encodeSseChunk({
        type: 'tool_start',
        toolName,
        ...(conversationId ? { conversationId } : {}),
      })
    )
    chunks.push(
      encodeSseChunk({
        type: 'tool_result',
        toolName,
        toolResult: toolResult.data,
        ...(conversationId ? { conversationId } : {}),
      })
    )
  }

  const doneChunk: AiStreamChunk = {
    type: 'done',
    ...(conversationId ? { conversationId } : {}),
    ...(response.usage
      ? {
          usage: {
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
          },
        }
      : {}),
    ...(response.aiCredits ? { aiCredits: response.aiCredits } : {}),
  }
  chunks.push(encodeSseChunk(doneChunk))

  return chunks
}

export function hasVisibleTitanChatPayload(response: TitanChatJsonResponse): boolean {
  const content = typeof response.content === 'string' ? response.content.trim() : ''
  if (content.length > 0) return true
  return (response.toolResults ?? []).some(
    (tr) =>
      typeof tr.toolName === 'string' &&
      tr.toolName.trim().length > 0 &&
      tr.data !== undefined
  )
}
