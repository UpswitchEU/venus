// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { dispatchAIChatChunk, makeChunkDispatchState } from '../tool-results-parser'

// dispatchAIChatChunk
// ---------------------------------------------------------------------

function freshCallbacks() {
  return {
    onText: vi.fn(),
    onToolStart: vi.fn(),
    onToolResult: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
}

describe('dispatchAIChatChunk — input tolerance', () => {
  it('is a noop for null / non-object / missing-type input', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk(null, state, cb)
    dispatchAIChatChunk(undefined, state, cb)
    dispatchAIChatChunk('string', state, cb)
    dispatchAIChatChunk({}, state, cb)
    dispatchAIChatChunk({ type: 42 }, state, cb)

    expect(cb.onText).not.toHaveBeenCalled()
    expect(cb.onToolStart).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('silently skips unknown type values (forward-compat for new Titan chunk types)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'future_chunk_kind', content: 'data' },
      makeChunkDispatchState(),
      cb
    )
    expect(cb.onText).not.toHaveBeenCalled()
  })
})

describe('dispatchAIChatChunk — text chunks', () => {
  it('fires onText with content when present', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'text', content: 'Hello' }, makeChunkDispatchState(), cb)
    expect(cb.onText).toHaveBeenCalledWith('Hello')
  })

  it('does NOT fire onText when content is empty string (no noise)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'text', content: '' }, makeChunkDispatchState(), cb)
    expect(cb.onText).not.toHaveBeenCalled()
  })

  it('does NOT fire onText when content is missing entirely', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-1' }, makeChunkDispatchState(), cb)
    expect(cb.onText).not.toHaveBeenCalled()
  })

  it('captures conversationId from text chunk into state (used as done fallback)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-from-text', content: 'hi' }, state, cb)
    expect(state.resolvedConversationId).toBe('cv-from-text')
  })

  it('does NOT overwrite captured conversationId when subsequent text chunk has empty conversationId', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-first', content: 'hi' }, state, cb)
    dispatchAIChatChunk({ type: 'text', conversationId: '', content: 'more' }, state, cb)
    expect(state.resolvedConversationId).toBe('cv-first')
  })
})

describe('dispatchAIChatChunk — tool chunks', () => {
  it('fires onToolStart with toolName', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'tool_start', toolName: 'run_valuation' },
      makeChunkDispatchState(),
      cb
    )
    expect(cb.onToolStart).toHaveBeenCalledWith('run_valuation')
  })

  it('does NOT fire onToolStart when toolName is missing (defensive against malformed envelope)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'tool_start' }, makeChunkDispatchState(), cb)
    expect(cb.onToolStart).not.toHaveBeenCalled()
  })

  it('fires onToolResult with toolName + toolResult', () => {
    const cb = freshCallbacks()
    const result = { type: 'normalization_suggestion', data: { category: 'rent' } }
    dispatchAIChatChunk(
      { type: 'tool_result', toolName: 'suggest_normalization', toolResult: result },
      makeChunkDispatchState(),
      cb
    )
    expect(cb.onToolResult).toHaveBeenCalledWith('suggest_normalization', result)
  })

  it('passes undefined toolResult through when missing (consumer handles)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk(
      { type: 'tool_result', toolName: 'noop_tool' },
      makeChunkDispatchState(),
      cb
    )
    expect(cb.onToolResult).toHaveBeenCalledWith('noop_tool', undefined)
  })
})

describe('dispatchAIChatChunk — terminal chunks', () => {
  it('silently absorbs keepalive chunks without callbacks or terminal state', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()

    const nextState = dispatchAIChatChunk({ type: '_keepalive' }, state, cb)

    expect(nextState).toBe(state)
    expect(state.doneReceived).toBe(false)
    expect(cb.onText).not.toHaveBeenCalled()
    expect(cb.onToolStart).not.toHaveBeenCalled()
    expect(cb.onToolResult).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('fires onDone with chunk.conversationId when present (preferred over captured)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'cv-from-earlier-text'
    dispatchAIChatChunk({ type: 'done', conversationId: 'cv-from-done' }, state, cb)
    expect(cb.onDone).toHaveBeenCalledWith('cv-from-done', { incomplete: false })
    expect(state.doneReceived).toBe(true)
  })

  it('falls back to captured conversationId when done chunk has none', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    state.resolvedConversationId = 'cv-from-earlier-text'
    dispatchAIChatChunk({ type: 'done' }, state, cb)
    expect(cb.onDone).toHaveBeenCalledWith('cv-from-earlier-text', { incomplete: false })
  })

  it('passes undefined to onDone when neither chunk nor state has a conversationId', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'done' }, makeChunkDispatchState(), cb)
    expect(cb.onDone).toHaveBeenCalledWith(undefined, { incomplete: false })
  })

  it('flips doneReceived to true on done (caller skips fallback onDone)', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'done' }, state, cb)
    expect(state.doneReceived).toBe(true)
  })

  it('fires onError with chunk.error and flips doneReceived', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'error', error: 'Rate limited' }, state, cb)
    expect(cb.onError).toHaveBeenCalledWith('Rate limited')
    expect(state.doneReceived).toBe(true)
  })

  it('falls back to "Unknown error" when error chunk has no error field', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'error' }, makeChunkDispatchState(), cb)
    expect(cb.onError).toHaveBeenCalledWith('Unknown error')
  })

  it('falls back to "Unknown error" when error field is empty string (no blank toast)', () => {
    const cb = freshCallbacks()
    dispatchAIChatChunk({ type: 'error', error: '' }, makeChunkDispatchState(), cb)
    expect(cb.onError).toHaveBeenCalledWith('Unknown error')
  })
})

describe('dispatchAIChatChunk — state threading across multiple chunks', () => {
  it('preserves captured conversationId across text → done sequence', () => {
    const cb = freshCallbacks()
    const state = makeChunkDispatchState()
    dispatchAIChatChunk({ type: 'text', conversationId: 'cv-x', content: 'streaming' }, state, cb)
    dispatchAIChatChunk({ type: 'text', content: 'more text' }, state, cb)
    dispatchAIChatChunk({ type: 'done' }, state, cb)

    expect(cb.onDone).toHaveBeenCalledWith('cv-x', { incomplete: false })
  })

  it("handles missing optional callbacks gracefully (consumer didn't wire them)", () => {
    // The dispatcher uses optional chaining — passing partial callbacks
    // should be a non-throwing no-op for unhandled chunk types.
    const onlyText = { onText: vi.fn() }
    dispatchAIChatChunk({ type: 'tool_start', toolName: 'x' }, makeChunkDispatchState(), onlyText)
    dispatchAIChatChunk({ type: 'done' }, makeChunkDispatchState(), onlyText)
    dispatchAIChatChunk({ type: 'error', error: 'x' }, makeChunkDispatchState(), onlyText)
    // No assertion needed — just confirming no throw.
    expect(onlyText.onText).not.toHaveBeenCalled()
  })
})
