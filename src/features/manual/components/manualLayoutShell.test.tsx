// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useManualLayoutViewport } from './manualLayoutShell'

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
}

describe('useManualLayoutViewport', () => {
  it('reports desktop only after viewport measurement', async () => {
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
})
