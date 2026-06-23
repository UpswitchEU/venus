// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useManualLayoutViewport } from './manualLayoutShell'

const originalMatchMedia = window.matchMedia

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
}

function disableMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: undefined,
  })
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<EventListener>()
  const mediaQuery = {
    addEventListener: vi.fn((_event: string, listener: EventListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: EventListener) =>
      listeners.delete(listener)
    ),
    addListener: vi.fn((listener: EventListener) => listeners.add(listener)),
    removeListener: vi.fn((listener: EventListener) => listeners.delete(listener)),
    get matches() {
      return matches
    },
    media: '(max-width: 767px)',
    onchange: null,
  } as unknown as MediaQueryList

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  })

  return {
    mediaQuery,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      for (const listener of listeners) listener(new Event('change'))
    },
  }
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('useManualLayoutViewport', () => {
  it('reports desktop only after viewport measurement', async () => {
    disableMatchMedia()
    setWindowWidth(1200)

    const { result } = renderHook(() => useManualLayoutViewport())

    await waitFor(() =>
      expect(result.current).toEqual({
        hasMeasuredViewport: true,
        isMobile: false,
      })
    )
  })

  it('reports mobile after measurement and updates on resize', async () => {
    disableMatchMedia()
    setWindowWidth(390)

    const { result } = renderHook(() => useManualLayoutViewport())

    await waitFor(() =>
      expect(result.current).toEqual({
        hasMeasuredViewport: true,
        isMobile: true,
      })
    )

    setWindowWidth(1024)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toEqual({
      hasMeasuredViewport: true,
      isMobile: false,
    })
  })

  it('subscribes to breakpoint changes through matchMedia when available', async () => {
    const media = installMatchMedia(false)
    const { result, unmount } = renderHook(() => useManualLayoutViewport())

    await waitFor(() =>
      expect(result.current).toEqual({
        hasMeasuredViewport: true,
        isMobile: false,
      })
    )

    act(() => {
      media.setMatches(true)
    })

    expect(result.current).toEqual({
      hasMeasuredViewport: true,
      isMobile: true,
    })

    unmount()
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })
})
