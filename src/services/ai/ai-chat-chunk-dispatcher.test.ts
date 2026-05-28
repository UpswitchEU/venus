import { AI_STREAM_KEEPALIVE_CHUNK_JSON } from '@upswitch/ai-actions'
import { describe, expect, it, vi } from 'vitest'
import {
  type ChunkDispatchCallbacks,
  dispatchAIChatChunk,
  makeChunkDispatchState,
} from './ai-chat-chunk-dispatcher'

/**
 * The dispatcher routes already-parsed SSE chunks from Titan's
 * `/api/v2/ai/stream` to the appropriate callback. Two contracts matter:
 *
 *   1. Each known chunk type fires its matching callback exactly once with
 *      the right payload, and updates state correctly (resolvedConversationId,
 *      doneReceived).
 *   2. The `default:` branch silently no-ops on unknown chunk types — this
 *      is what keeps the FE compatible with future Titan additions WITHOUT
 *      a redeploy, and it's how the SSE keep-alive heartbeat
 *      (`AI_STREAM_KEEPALIVE_CHUNK_JSON`) survives the dispatch loop without
 *      firing onText / onDone / onError.
 *
 * Mirrors the contract pins on Mercury
 * (`apps/mercury/tests/unit/ai-dock-tool-card-parser-streaming.test.ts`).
 */

function makeCallbacks(): {
  callbacks: Required<ChunkDispatchCallbacks>
  spies: Record<keyof ChunkDispatchCallbacks, ReturnType<typeof vi.fn>>
} {
  const onText = vi.fn()
  const onToolStart = vi.fn()
  const onToolResult = vi.fn()
  const onDone = vi.fn()
  const onError = vi.fn()
  return {
    callbacks: { onText, onToolStart, onToolResult, onDone, onError },
    spies: { onText, onToolStart, onToolResult, onDone, onError },
  }
}

describe('dispatchAIChatChunk', () => {
  it('routes text chunks to onText and captures conversationId on state', () => {
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()

    dispatchAIChatChunk(
      { type: 'text', content: 'Hello', conversationId: 'conv-1' },
      state,
      callbacks
    )

    expect(spies.onText).toHaveBeenCalledWith('Hello')
    expect(state.resolvedConversationId).toBe('conv-1')
    expect(state.doneReceived).toBe(false)
  })

  it('skips onText when content is empty (so empty intro chunks don\'t fire as content)', () => {
    const { callbacks, spies } = makeCallbacks()
    dispatchAIChatChunk(
      { type: 'text', content: '', conversationId: 'conv-1' },
      makeChunkDispatchState(),
      callbacks
    )
    expect(spies.onText).not.toHaveBeenCalled()
  })

  it('routes tool_start / tool_result with the toolName + payload', () => {
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()

    dispatchAIChatChunk(
      { type: 'tool_start', toolName: 'run_valuation' },
      state,
      callbacks
    )
    dispatchAIChatChunk(
      { type: 'tool_result', toolName: 'run_valuation', toolResult: { id: 'r1' } },
      state,
      callbacks
    )

    expect(spies.onToolStart).toHaveBeenCalledWith('run_valuation')
    expect(spies.onToolResult).toHaveBeenCalledWith('run_valuation', { id: 'r1' })
  })

  it('done flips doneReceived and prefers chunk.conversationId over state', () => {
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'state-conv'

    dispatchAIChatChunk(
      { type: 'done', conversationId: 'done-conv' },
      state,
      callbacks
    )

    expect(state.doneReceived).toBe(true)
    expect(spies.onDone).toHaveBeenCalledWith('done-conv')
  })

  it('done falls back to state.resolvedConversationId when chunk omits it', () => {
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'state-conv'

    dispatchAIChatChunk({ type: 'done' }, state, callbacks)

    expect(spies.onDone).toHaveBeenCalledWith('state-conv')
  })

  it('error fires onError with the chunk message and flips doneReceived', () => {
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()

    dispatchAIChatChunk({ type: 'error', error: 'boom' }, state, callbacks)

    expect(spies.onError).toHaveBeenCalledWith('boom')
    expect(state.doneReceived).toBe(true)
  })

  it('error falls back to "Unknown error" when chunk.error is empty', () => {
    const { callbacks, spies } = makeCallbacks()

    dispatchAIChatChunk({ type: 'error', error: '' }, makeChunkDispatchState(), callbacks)

    expect(spies.onError).toHaveBeenCalledWith('Unknown error')
  })

  it('returns state unchanged for non-object / null chunks (defensive)', () => {
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()

    dispatchAIChatChunk(null, state, callbacks)
    dispatchAIChatChunk('string-not-object' as unknown, state, callbacks)
    dispatchAIChatChunk(42 as unknown, state, callbacks)

    for (const spy of Object.values(spies)) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(state.doneReceived).toBe(false)
    expect(state.resolvedConversationId).toBe('')
  })

  it('silently no-ops on unknown chunk types (forward-compat)', () => {
    const { callbacks, spies } = makeCallbacks()

    dispatchAIChatChunk(
      { type: 'future_type', data: 'whatever' },
      makeChunkDispatchState(),
      callbacks
    )

    for (const spy of Object.values(spies)) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('silently absorbs `_keepalive` chunks (BE → FE keep-alive contract)', () => {
    // Titan's `AiController.stream()` and `OnboardingAgentController.stream()`
    // interleave AI_STREAM_KEEPALIVE_CHUNK_JSON every 30s to defend against
    // Cloudflare's ~100s idle-connection limit. The dispatcher MUST treat
    // these as no-ops — they must NOT fire onText / onDone / onError, or
    // they'd corrupt the conversation state and credit accounting.
    //
    // This test parses AI_STREAM_KEEPALIVE_CHUNK_JSON exactly as the FE's
    // SSE reader would, so a drift in the shared wire format breaks this
    // test first. Mirrors the Mercury pin at
    // `tests/unit/ai-dock-tool-card-parser-streaming.test.ts`.
    const { callbacks, spies } = makeCallbacks()
    const state = makeChunkDispatchState()
    const parsed = JSON.parse(AI_STREAM_KEEPALIVE_CHUNK_JSON)

    expect(parsed).toEqual({ type: '_keepalive' })
    dispatchAIChatChunk(parsed, state, callbacks)

    for (const spy of Object.values(spies)) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(state.doneReceived).toBe(false)
    expect(state.resolvedConversationId).toBe('')
  })

  it('routes stream_recovery meta to onBffStreamRecovery without terminal side effects', () => {
    const onBffStreamRecovery = vi.fn()
    const { callbacks, spies } = makeCallbacks()
    callbacks.onBffStreamRecovery = onBffStreamRecovery
    const state = makeChunkDispatchState()

    dispatchAIChatChunk(
      { type: 'stream_recovery', source: 'bff-fallback-failed' },
      state,
      callbacks
    )

    expect(onBffStreamRecovery).toHaveBeenCalledWith('bff-fallback-failed')
    expect(spies.onError).not.toHaveBeenCalled()
    expect(spies.onDone).not.toHaveBeenCalled()
    expect(state.doneReceived).toBe(false)
  })
})
