import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSmoothStreamedText } from './useSmoothStreamedText'

// Force motion on; the reveal logic under test only runs when animation is allowed.
vi.mock('@/design-system/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }))

// Manual requestAnimationFrame queue so frames can be stepped deterministically.
let rafCallbacks: Array<(ts: number) => void> = []

function flushFrame(ts: number) {
  const callbacks = rafCallbacks
  rafCallbacks = []
  act(() => {
    for (const cb of callbacks) cb(ts)
  })
}

describe('useSmoothStreamedText', () => {
  beforeEach(() => {
    rafCallbacks = []
    let id = 0
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
      rafCallbacks.push(cb)
      return ++id
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a completed (non-streaming) message in full immediately', () => {
    const { result } = renderHook(() => useSmoothStreamedText('Hello world', false))
    expect(result.current.text).toBe('Hello world')
    expect(result.current.isAnimating).toBe(false)
  })

  it('reveals streamed text progressively and converges to the full string', () => {
    const full = 'x'.repeat(400)
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: '', streaming: true } }
    )

    // A whole burst arrives at once (worst case for "chunkiness").
    rerender({ text: full, streaming: true })

    // Nothing painted yet — the buffer hasn't drained any frames.
    expect(result.current.text.length).toBe(0)
    expect(result.current.isAnimating).toBe(true)

    // A few frames in, we've revealed *some* but not all — i.e. it eases in
    // rather than dumping the whole burst.
    let ts = 0
    for (let i = 0; i < 3; i++) {
      ts += 16
      flushFrame(ts)
    }
    const midway = result.current.text.length
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(full.length)
    // What's shown is always a real prefix of the source.
    expect(full.startsWith(result.current.text)).toBe(true)

    // Stream ends; the tail drains to completion within a handful of frames.
    rerender({ text: full, streaming: false })
    for (let i = 0; i < 60; i++) {
      ts += 16
      flushFrame(ts)
    }
    expect(result.current.text).toBe(full)
    expect(result.current.isAnimating).toBe(false)
  })

  it('falls back to full text when requestAnimationFrame is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { result } = renderHook(() => useSmoothStreamedText('streamed body', true))
    expect(result.current.text).toBe('streamed body')
  })
})
