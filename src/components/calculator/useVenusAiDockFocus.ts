'use client'

import { type RefObject, useEffect, useRef } from 'react'

/**
 * Saves the element focused before the dock opened and restores it on close.
 * Optionally focuses the composer when the dock opens (mobile scroll-lock path).
 */
export function useVenusAiDockFocus(
  open: boolean,
  focusTargetRef: RefObject<HTMLElement | null>,
  shouldAutoFocus: boolean
): void {
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      const active = document.activeElement
      if (active instanceof HTMLElement) {
        lastFocusedRef.current = active
      }
      if (!shouldAutoFocus) return
      const timer = window.setTimeout(() => {
        focusTargetRef.current?.focus({ preventScroll: true })
      }, 100)
      return () => window.clearTimeout(timer)
    }

    const previous = lastFocusedRef.current
    lastFocusedRef.current = null
    if (previous?.isConnected) {
      previous.focus({ preventScroll: true })
    }
  }, [open, shouldAutoFocus, focusTargetRef])
}
