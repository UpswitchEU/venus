/**
 * Pins a scroll container to the bottom while content grows — so smoothly
 * revealed streaming text stays in view without snapping.
 *
 * Keying scroll on message-state updates alone misses the gradual reveal that
 * happens *between* state updates (the smoothing buffer adds a few characters
 * per frame). A ResizeObserver on the content element catches every height
 * change and pins to the bottom, but only while the user is already near the
 * bottom — scrolling up to re-read must not yank them back down.
 */

import { type RefObject, useEffect, useRef } from 'react'

// How close to the bottom (px) still counts as "following along".
const STICK_THRESHOLD_PX = 80

export function useStickToBottom(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  const stickRef = useRef(true)

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    const content = contentRef.current
    if (!container) return

    const distanceFromBottom = () =>
      container.scrollHeight - container.scrollTop - container.clientHeight

    const updateStick = () => {
      stickRef.current = distanceFromBottom() <= STICK_THRESHOLD_PX
    }

    const pin = () => {
      if (stickRef.current) container.scrollTop = container.scrollHeight
    }

    updateStick()
    container.addEventListener('scroll', updateStick, { passive: true })

    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(pin)
      if (content) observer.observe(content)
      observer.observe(container)
    }

    return () => {
      container.removeEventListener('scroll', updateStick)
      observer?.disconnect()
    }
  }, [containerRef, contentRef, enabled])
}
