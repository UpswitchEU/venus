// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMotionConfig, useReducedMotion } from './useReducedMotion'

const originalMatchMedia = window.matchMedia

function installReducedMotionMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  })
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('useReducedMotion', () => {
  it('reads reduced-motion preference through the shared media query hook', async () => {
    installReducedMotionMatchMedia(true)

    const { result } = renderHook(() => useReducedMotion())

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('disables motion config animations when reduced motion is preferred', async () => {
    installReducedMotionMatchMedia(true)

    const { result } = renderHook(() => useMotionConfig())

    await waitFor(() =>
      expect(result.current).toEqual({
        animate: false,
        prefersReducedMotion: true,
        transition: { duration: 0 },
      })
    )
  })
})
