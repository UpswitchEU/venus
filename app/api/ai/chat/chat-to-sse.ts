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

export type BffStreamRecoverySource =
  | 'bff-fallback'
  | 'bff-fallback-failed'
  | 'bff-stream-incomplete'

/** Wire-only SSE meta chunk so the FE skips duplicate non-stream recovery. */
export function encodeStreamRecoveryMetaSseBytes(source: BffStreamRecoverySource): Uint8Array[] {
  return [
    new TextEncoder().encode(`data: ${JSON.stringify({ type: 'stream_recovery', source })}\n\n`),
  ]
}

export function encodeStreamFallbackErrorSseBytes(
  message = 'AI stream fallback failed'
): Uint8Array[] {
  return [encodeSseChunk({ type: 'error', error: message })]
}

function readSseFrameJson(frame: string): unknown | null {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  if (dataLines.length === 0) return null
  const json = dataLines.join('\n')
  if (!json || json === '[DONE]') return null
  try {
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
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

export function isTerminalAiStreamChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') return false
  const typed = chunk as {
    type?: string
    toolResult?: unknown
    error?: string
  }
  if (typed.type === 'done') return true
  if (typed.type === 'tool_result' && typed.toolResult !== undefined) return true
  if (typed.type === 'error' && typeof typed.error === 'string' && typed.error.trim()) {
    return true
  }
  return false
}

export function createSseStreamContentScanner() {
  let buffer = ''
  let sawVisibleStreamContent = false
  let sawStreamCompletion = false
  const decoder = new TextDecoder()

  const ingestFrame = (frame: string) => {
    const chunk = readSseFrameJson(frame)
    if (!chunk) return
    if (isVisibleAiStreamChunk(chunk)) sawVisibleStreamContent = true
    if (isTerminalAiStreamChunk(chunk)) sawStreamCompletion = true
  }

  return {
    push(bytes: Uint8Array) {
      buffer += decoder.decode(bytes, { stream: true })
      while (true) {
        const separatorMatch = /\r?\n\r?\n/.exec(buffer)
        if (!separatorMatch) break
        const frame = buffer.slice(0, separatorMatch.index)
        buffer = buffer.slice(separatorMatch.index + separatorMatch[0].length)
        ingestFrame(frame)
      }
    },
    flush() {
      const trimmed = buffer.trim()
      buffer = ''
      if (trimmed) ingestFrame(trimmed)
    },
    get sawVisibleStreamContent() {
      return sawVisibleStreamContent
    },
    get sawStreamCompletion() {
      return sawStreamCompletion
    },
  }
}

export function sseBytesContainVisibleContent(bytes: Uint8Array): boolean {
  const scanner = createSseStreamContentScanner()
  scanner.push(bytes)
  scanner.flush()
  return scanner.sawVisibleStreamContent
}

export function sseBytesContainCompletionSignals(bytes: Uint8Array): boolean {
  const scanner = createSseStreamContentScanner()
  scanner.push(bytes)
  scanner.flush()
  return scanner.sawStreamCompletion
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
