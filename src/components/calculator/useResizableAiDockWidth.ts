'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampVenusAiDockWidth,
  VENUS_AI_DOCK_DEFAULT_WIDTH,
  VENUS_AI_DOCK_MAX_WIDTH,
  VENUS_AI_DOCK_MIN_WIDTH,
  VENUS_AI_DOCK_STORAGE_KEY,
  VENUS_AI_DOCK_WIDTH_CSS_VAR,
} from './venus-ai-dock-layout'

type DockWidthStyle = React.CSSProperties & {
  [VENUS_AI_DOCK_WIDTH_CSS_VAR]?: string
}

function getViewportWidth(): number {
  if (typeof window === 'undefined') return 0
  return window.innerWidth || document.documentElement.clientWidth || 0
}

function readStoredDockWidth(): number {
  if (typeof window === 'undefined') return VENUS_AI_DOCK_DEFAULT_WIDTH
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(VENUS_AI_DOCK_STORAGE_KEY)
  } catch {
    stored = null
  }
  const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN
  return clampVenusAiDockWidth(
    Number.isFinite(parsed) ? parsed : VENUS_AI_DOCK_DEFAULT_WIDTH,
    getViewportWidth()
  )
}

function persistDockWidth(width: number) {
  try {
    window.localStorage.setItem(VENUS_AI_DOCK_STORAGE_KEY, String(width))
  } catch {
    // Storage can be unavailable in restricted browser modes; resizing should still work.
  }
}

export function useResizableAiDockWidth() {
  const [width, setWidth] = useState(readStoredDockWidth)
  const activeDragRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const clamped = clampVenusAiDockWidth(width, getViewportWidth())
    document.documentElement.style.setProperty(VENUS_AI_DOCK_WIDTH_CSS_VAR, `${clamped}px`)
    persistDockWidth(clamped)
  }, [width])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setWidth((current) => clampVenusAiDockWidth(current, getViewportWidth()))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(
    () => () => {
      activeDragRef.current?.()
    },
    []
  )

  const setClampedWidth = useCallback((nextWidth: number) => {
    setWidth(clampVenusAiDockWidth(nextWidth, getViewportWidth()))
  }, [])

  const beginResize = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== undefined && event.button !== 0) return
      event.preventDefault()
      activeDragRef.current?.()

      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!Number.isFinite(moveEvent.clientX)) return
        setClampedWidth(getViewportWidth() - moveEvent.clientX)
      }
      const handleTarget = event.currentTarget
      const pointerId = event.pointerId
      const cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', cleanup)
        window.removeEventListener('pointercancel', cleanup)
        handleTarget.releasePointerCapture?.(pointerId)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        activeDragRef.current = null
      }

      activeDragRef.current = cleanup
      handleTarget.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', cleanup)
      window.addEventListener('pointercancel', cleanup)
    },
    [setClampedWidth]
  )

  const resetWidth = useCallback(() => {
    setClampedWidth(VENUS_AI_DOCK_DEFAULT_WIDTH)
  }, [setClampedWidth])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setClampedWidth(width + 24)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setClampedWidth(width - 24)
      } else if (event.key === 'Home') {
        event.preventDefault()
        setClampedWidth(VENUS_AI_DOCK_MIN_WIDTH)
      } else if (event.key === 'End') {
        event.preventDefault()
        setClampedWidth(VENUS_AI_DOCK_MAX_WIDTH)
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        resetWidth()
      }
    },
    [resetWidth, setClampedWidth, width]
  )

  const style = useMemo<DockWidthStyle>(
    () => ({
      [VENUS_AI_DOCK_WIDTH_CSS_VAR]: `${width}px`,
    }),
    [width]
  )

  return {
    width,
    style,
    resizeHandleProps: {
      role: 'separator' as const,
      tabIndex: 0,
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': VENUS_AI_DOCK_MIN_WIDTH,
      'aria-valuemax': VENUS_AI_DOCK_MAX_WIDTH,
      'aria-valuenow': width,
      onPointerDown: beginResize,
      onDoubleClick: resetWidth,
      onKeyDown: handleKeyDown,
    },
  }
}
