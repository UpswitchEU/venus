/**
 * Hybrid Aurora Design System
 * useReducedMotion Hook
 *
 * Respects user's motion preferences for accessibility
 */

import { useEffect, useState } from 'react'

/**
 * Detects if the user has requested reduced motion
 * Returns true if prefers-reduced-motion: reduce is set
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    // Check if window is available (SSR safety)
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }

    if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange)
      return () => {
        mediaQuery.removeListener(handleChange)
      }
    }
  }, [])

  return prefersReducedMotion
}

/**
 * Returns animation config based on reduced motion preference
 * Useful for conditionally applying animations
 */
export function useMotionConfig() {
  const prefersReducedMotion = useReducedMotion()

  return {
    prefersReducedMotion,
    // Disable animations entirely if reduced motion is preferred
    animate: !prefersReducedMotion,
    // Reduced transition for accessibility
    transition: prefersReducedMotion ? { duration: 0 } : undefined,
  }
}
