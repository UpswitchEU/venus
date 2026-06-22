'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  VENUS_AI_DOCK_DEFAULT_WIDTH,
  VENUS_AI_DOCK_MAX_WIDTH,
  VENUS_AI_DOCK_MIN_WIDTH,
  VENUS_AI_DOCK_WIDTH_CSS_VAR,
} from './venus-ai-dock-layout'
import {
  readStoredVenusAiDockWidth,
  resolveVenusAiDockKeyboardWidth,
  resolveVenusAiDockPointerWidth,
  resolveVenusAiDockWidth,
  writeStoredVenusAiDockWidth,
} from './venus-ai-dock-resize-model'

type DockWidthStyle = React.CSSProperties & {
  [VENUS_AI_DOCK_WIDTH_CSS_VAR]?: string
}

export function useResizableAiDockWidth() {
  const [width, setWidth] = useState(readStoredVenusAiDockWidth)
  const activeDragRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const clamped = resolveVenusAiDockWidth(width)
    document.documentElement.style.setProperty(VENUS_AI_DOCK_WIDTH_CSS_VAR, `${clamped}px`)
    writeStoredVenusAiDockWidth(clamped)
  }, [width])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setWidth((current) => resolveVenusAiDockWidth(current))
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
    setWidth(resolveVenusAiDockWidth(nextWidth))
  }, [])

  const beginResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    activeDragRef.current?.()

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = resolveVenusAiDockPointerWidth(moveEvent.clientX)
      if (nextWidth == null) return
      setWidth(nextWidth)
    }
    const handleTarget = event.currentTarget
    const pointerId = event.pointerId
    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      try {
        handleTarget.releasePointerCapture?.(pointerId)
      } catch {
        // The pointer may already be released if the gesture was cancelled by the browser.
      }
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      activeDragRef.current = null
    }

    activeDragRef.current = cleanup
    try {
      handleTarget.setPointerCapture?.(pointerId)
    } catch {
      // Window-level listeners still keep the resize interaction working.
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }, [])

  const resetWidth = useCallback(() => {
    setClampedWidth(VENUS_AI_DOCK_DEFAULT_WIDTH)
  }, [setClampedWidth])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const nextWidth = resolveVenusAiDockKeyboardWidth({ currentWidth: width, key: event.key })
      if (nextWidth == null) return
      event.preventDefault()
      setWidth(nextWidth)
    },
    [width]
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
