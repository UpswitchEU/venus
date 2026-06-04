import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useVisualViewportDrawerInsets } from './useVisualViewportDrawerInsets'
import { renderHook, act } from '@testing-library/react'

describe('useVisualViewportDrawerInsets', () => {
  const listeners = new Map<string, Set<EventListener>>()
  const frameCallbacks = new Map<number, FrameRequestCallback>()
  let nextFrameId = 0
  let originalInnerHeight = 0

  function flushAnimationFrames() {
    const callbacks = Array.from(frameCallbacks.values())
    frameCallbacks.clear()
    for (const callback of callbacks) {
      callback(performance.now())
    }
  }

  beforeEach(() => {
    listeners.clear()
    frameCallbacks.clear()
    nextFrameId = 0
    originalInnerHeight = window.innerHeight
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrameId += 1
      frameCallbacks.set(nextFrameId, callback)
      return nextFrameId
    })
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
      frameCallbacks.delete(frameId)
    })
    vi.stubGlobal('visualViewport', {
      offsetTop: 12,
      height: 720,
      addEventListener(type: string, listener: EventListener) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(listener)
      },
      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener)
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    })
    vi.unstubAllGlobals()
  })

  it('returns null when disabled', () => {
    const { result } = renderHook(() => useVisualViewportDrawerInsets(false))
    expect(result.current).toBeNull()
  })

  it('syncs top and height when enabled', () => {
    const { result } = renderHook(() => useVisualViewportDrawerInsets(true))
    expect(result.current).toEqual({ top: 12, height: 720 })
  })

  it('updates when visualViewport resizes', () => {
    const { result } = renderHook(() => useVisualViewportDrawerInsets(true))

    act(() => {
      Object.assign(window.visualViewport!, { offsetTop: 40, height: 560 })
      for (const listener of listeners.get('resize') ?? []) {
        listener(new Event('resize'))
      }
      flushAnimationFrames()
    })

    expect(result.current).toEqual({ top: 40, height: 560 })
  })

  it('coalesces bursty visualViewport events into the latest frame', () => {
    const { result } = renderHook(() => useVisualViewportDrawerInsets(true))

    act(() => {
      Object.assign(window.visualViewport!, { offsetTop: 20, height: 600 })
      for (const listener of listeners.get('resize') ?? []) {
        listener(new Event('resize'))
      }
      Object.assign(window.visualViewport!, { offsetTop: 44, height: 552 })
      for (const listener of listeners.get('scroll') ?? []) {
        listener(new Event('scroll'))
      }
      flushAnimationFrames()
    })

    expect(result.current).toEqual({ top: 44, height: 552 })
  })

  it('falls back to window height when visualViewport reports a transient zero height', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 640,
    })
    Object.assign(window.visualViewport!, { offsetTop: 12, height: 0 })

    const { result } = renderHook(() => useVisualViewportDrawerInsets(true))

    expect(result.current).toEqual({ top: 12, height: 640 })
  })
})
