'use client'

import { useEffect } from 'react'

/**
 * Robust scroll lock for modals/drawers - works on iOS Safari and Android.
 *
 * iOS Safari ignores overflow:hidden due to rubber-band overscroll.
 * This hook uses position:fixed + top offset to preserve scroll position
 * and prevent background scrolling.
 *
 * Features:
 * - Scrollbar width compensation (prevents layout shift when scrollbar hides)
 * - RAF-based scroll restoration (avoids flash/jump)
 * - touch-action: none + overscroll-behavior: none for iOS
 */
export function useScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return

    const scrollY = window.scrollY
    const html = document.documentElement
    const body = document.body

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    const originalHtmlOverflow = html.style.overflow
    const originalBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      paddingRight: body.style.paddingRight,
      touchAction: body.style.touchAction,
      overscrollBehavior: body.style.overscrollBehavior,
    }

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.touchAction = 'none'
    body.style.overscrollBehavior = 'none'
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      html.style.overflow = originalHtmlOverflow
      body.style.overflow = originalBodyStyles.overflow
      body.style.position = originalBodyStyles.position
      body.style.top = originalBodyStyles.top
      body.style.left = originalBodyStyles.left
      body.style.right = originalBodyStyles.right
      body.style.paddingRight = originalBodyStyles.paddingRight
      body.style.touchAction = originalBodyStyles.touchAction
      body.style.overscrollBehavior = originalBodyStyles.overscrollBehavior
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY)
      })
    }
  }, [isLocked])
}
