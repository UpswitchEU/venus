import type { AiStreamChunk } from '@upswitch/ai-actions'

/**
 * State the `dispatchAIChatChunk` dispatcher reads + writes across calls
 * within a single stream consumption. The caller owns the state object
 * and threads it through each chunk so the dispatcher stays pure.
 */
export interface ChunkDispatchState {
  resolvedConversationId: string
  doneReceived: boolean
}

export function makeChunkDispatchState(): ChunkDispatchState {
  return { resolvedConversationId: '', doneReceived: false }
}

/**
 * Callback bag the dispatcher fires for each meaningful chunk type.
 * Mirrors `AIChatService.StreamCallbacks` exactly so the service can
 * pass its callback object straight through.
 */
export interface ChunkDispatchCallbacks {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onDone?: (conversationId?: string) => void
  onError?: (error: string) => void
}

/**
 * Dispatch a single SSE chunk (already JSON-parsed) to the appropriate
 * callback. Extracted from `AIChatService.streamMessage` so the routing
 * logic stays directly testable.
 */
export function dispatchAIChatChunk(
  chunk: unknown,
  state: ChunkDispatchState,
  callbacks: ChunkDispatchCallbacks
): ChunkDispatchState {
  if (!chunk || typeof chunk !== 'object') return state
  const c = chunk as AiStreamChunk & Record<string, unknown>
  const type = c.type
  if (typeof type !== 'string') return state

  switch (type) {
    case 'text':
      if (typeof c.conversationId === 'string' && c.conversationId.length > 0) {
        state.resolvedConversationId = c.conversationId
      }
      if (typeof c.content === 'string' && c.content.length > 0) {
        callbacks.onText?.(c.content)
      }
      break
    case 'tool_start':
      if (typeof c.toolName === 'string') {
        callbacks.onToolStart?.(c.toolName)
      }
      break
    case 'tool_result':
      if (typeof c.toolName === 'string') {
        callbacks.onToolResult?.(c.toolName, c.toolResult)
      }
      break
    case 'done':
      state.doneReceived = true
      callbacks.onDone?.(
        typeof c.conversationId === 'string' && c.conversationId.length > 0
          ? c.conversationId
          : state.resolvedConversationId || undefined
      )
      break
    case 'error':
      state.doneReceived = true
      callbacks.onError?.(
        typeof c.error === 'string' && c.error.length > 0 ? c.error : 'Unknown error'
      )
      break
    default:
      // Unknown type - silently skip for forward compatibility.
      break
  }

  return state
}
