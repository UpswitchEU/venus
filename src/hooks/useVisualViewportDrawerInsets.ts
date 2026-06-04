'use client'

import { useEffect, useState } from 'react'

export type VisualViewportDrawerInsets = {
  top: number
  height: number
}

function sameInsets(
  left: VisualViewportDrawerInsets | null,
  right: VisualViewportDrawerInsets | null
): boolean {
  return left?.top === right?.top && left?.height === right?.height
}

function readViewportInsets(vv: VisualViewport): VisualViewportDrawerInsets | null {
  const heightSource = Number.isFinite(vv.height) && vv.height > 0 ? vv.height : window.innerHeight
  const height = Number.isFinite(heightSource) && heightSource > 0 ? Math.round(heightSource) : 0

  if (height <= 0) return null

  return {
    top: Number.isFinite(vv.offsetTop) && vv.offsetTop > 0 ? Math.round(vv.offsetTop) : 0,
    height,
  }
}

/**
 * Tracks visual viewport geometry for full-screen mobile drawers.
 * Keeps fixed panels aligned when the soft keyboard opens (iOS Safari / Android).
 */
export function useVisualViewportDrawerInsets(enabled: boolean): VisualViewportDrawerInsets | null {
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

    let frameId: number | null = null
    const applyInsets = () => {
      frameId = null
      const next = readViewportInsets(vv)
      setInsets((current) => (sameInsets(current, next) ? current : next))
    }
    const scheduleSync = () => {
      if (typeof window.requestAnimationFrame !== 'function') {
        applyInsets()
        return
      }
      if (frameId !== null) {
        window.cancelAnimationFrame?.(frameId)
      }
      frameId = window.requestAnimationFrame(applyInsets)
    }

    applyInsets()
    vv.addEventListener('resize', scheduleSync)
    vv.addEventListener('scroll', scheduleSync)
    window.addEventListener('orientationchange', scheduleSync)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame?.(frameId)
      }
      vv.removeEventListener('resize', scheduleSync)
      vv.removeEventListener('scroll', scheduleSync)
      window.removeEventListener('orientationchange', scheduleSync)
    }
  }, [enabled])

  return insets
}
