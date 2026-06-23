/**
 * Hybrid Aurora Design System
 * useReducedMotion Hook
 *
 * Respects user's motion preferences for accessibility
 */

import { useMediaQuery } from '../../hooks/useMediaQuery'
import { REDUCED_MOTION_QUERY } from '../utils'

/**
 * Detects if the user has requested reduced motion
 * Returns true if prefers-reduced-motion: reduce is set
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY).matches
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
