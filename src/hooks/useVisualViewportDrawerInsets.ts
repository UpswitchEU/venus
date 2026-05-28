'use client'

import { useEffect, useState } from 'react'

export type VisualViewportDrawerInsets = {
  top: number
  height: number
}

/**
 * Tracks visual viewport geometry for full-screen mobile drawers.
 * Keeps fixed panels aligned when the soft keyboard opens (iOS Safari / Android).
 */
export function useVisualViewportDrawerInsets(
  enabled: boolean
): VisualViewportDrawerInsets | null {
  const [insets, setInsets] = useState<VisualViewportDrawerInsets | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setInsets(null)
      return
    }

    const vv = window.visualViewport
    if (!vv) {
      setInsets(null)
      return
    }

    const sync = () => {
      setInsets({
        top: vv.offsetTop,
        height: vv.height,
      })
    }

    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)

    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [enabled])

  return insets
}
