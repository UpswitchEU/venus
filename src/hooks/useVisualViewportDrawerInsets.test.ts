import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useVisualViewportDrawerInsets } from './useVisualViewportDrawerInsets'
import { renderHook, act } from '@testing-library/react'

describe('useVisualViewportDrawerInsets', () => {
  const listeners = new Map<string, Set<EventListener>>()

  beforeEach(() => {
    listeners.clear()
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
    })

    expect(result.current).toEqual({ top: 40, height: 560 })
  })
})
