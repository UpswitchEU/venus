// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

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

function installMatchMedia(initialMatches: boolean, legacy = false) {
  let matches = initialMatches
  const listeners = new Set<EventListener>()
  const mediaQuery = {
    addEventListener: legacy
      ? undefined
      : vi.fn((_event: string, listener: EventListener) => listeners.add(listener)),
    removeEventListener: legacy
      ? undefined
      : vi.fn((_event: string, listener: EventListener) => listeners.delete(listener)),
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

describe('useMediaQuery', () => {
  it('reports measured media-query state and updates on change events', async () => {
    const media = installMatchMedia(false)
    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))

    await waitFor(() => expect(result.current).toEqual({ hasMeasured: true, matches: false }))

    act(() => {
      media.setMatches(true)
    })

    expect(result.current).toEqual({ hasMeasured: true, matches: true })
    unmount()
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  it('supports legacy media-query listeners', async () => {
    const media = installMatchMedia(false, true)
    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))

    await waitFor(() => expect(result.current).toEqual({ hasMeasured: true, matches: false }))

    act(() => {
      media.setMatches(true)
    })

    expect(result.current).toEqual({ hasMeasured: true, matches: true })
    unmount()
    expect(media.mediaQuery.removeListener).toHaveBeenCalledWith(expect.any(Function))
  })

  it('uses resize and orientation fallback when matchMedia is unavailable', async () => {
    disableMatchMedia()
    setWindowWidth(390)
    const getFallbackMatches = () => window.innerWidth < 768
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)', { getFallbackMatches }))

    await waitFor(() => expect(result.current).toEqual({ hasMeasured: true, matches: true }))

    setWindowWidth(1024)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toEqual({ hasMeasured: true, matches: false })
  })
})
