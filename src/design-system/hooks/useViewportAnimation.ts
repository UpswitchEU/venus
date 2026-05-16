'use client'

/**
 * Hybrid Aurora Design System
 * useViewportAnimation Hook
 *
 * Scroll-triggered animation utilities with IntersectionObserver
 *
 * CRITICAL FIX: Content is ALWAYS visible on first render (SSR-safe).
 * Animation only kicks in after hydration + intersection.
 */

import { type UseInViewOptions, useInView } from 'framer-motion'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { type AnimationVariant } from './animationVariants'
import { useReducedMotion } from './useReducedMotion'
import { type SpringPreset, springPresets } from './useSpring'
import { type ViewportPreset, viewportPresets } from './viewportPresets'

export { type AnimationVariant, animationVariants } from './animationVariants'
export { useStaggerChild, useStaggerContainer } from './useStagger'
// Re-exports for convenience
export { type ViewportPreset, viewportPresets } from './viewportPresets'

interface UseViewportAnimationOptions {
  /** Viewport trigger preset */
  viewport?: ViewportPreset
  /** Spring animation preset */
  spring?: SpringPreset
  /** Animation variant */
  variant?: AnimationVariant
  /** Only animate once */
  once?: boolean
  /** Custom delay in seconds */
  delay?: number
  /** Custom InView options */
  inViewOptions?: UseInViewOptions
}

// Global debug mode state
let debugModeEnabled = false
const debugListeners: Set<() => void> = new Set()

export function enableMotionDebug(enabled: boolean) {
  debugModeEnabled = enabled
  debugListeners.forEach((fn) => fn())
}

export function useMotionDebug() {
  const [debug, setDebug] = useState(debugModeEnabled)

  useEffect(() => {
    const listener = () => setDebug(debugModeEnabled)
    debugListeners.add(listener)
    return () => {
      debugListeners.delete(listener)
    }
  }, [])

  return debug
}

/**
 * Complete viewport animation hook
 * Returns ref, inView state, and animation props
 *
 * SAFETY: Uses a "hydrated" flag so first paint is ALWAYS visible.
 * Animation only starts after client-side hydration completes.
 */
export function useViewportAnimation<T extends HTMLElement = HTMLDivElement>(
  options: UseViewportAnimationOptions = {}
) {
  const {
    viewport = 'default',
    spring = 'default',
    once = true,
    delay = 0,
    inViewOptions,
  } = options

  const prefersReducedMotion = useReducedMotion()
  const ref = useRef<T>(null)

  // CRITICAL: Start with hasMounted=false so first render is visible
  const [hasMounted, setHasMounted] = useState(false)
  const [forceVisible, setForceVisible] = useState(false)

  const viewportConfig = viewportPresets[viewport]
  const isInView = useInView(ref, {
    once,
    margin: viewportConfig.margin as UseInViewOptions['margin'],
    amount: viewportConfig.amount,
    ...inViewOptions,
  })

  // Mark as mounted after first render (client-side only)
  useEffect(() => {
    const t = requestAnimationFrame(() => setHasMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Failsafe: if IntersectionObserver doesn't fire, force visible after timeout
  useEffect(() => {
    if (prefersReducedMotion || !hasMounted) return

    const ioSupported = typeof window !== 'undefined' && 'IntersectionObserver' in window
    if (!ioSupported) {
      setForceVisible(true)
      return
    }

    // If not in view after mounting, force visible after 300ms
    if (!isInView && ref.current) {
      const t = window.setTimeout(() => setForceVisible(true), 300)
      return () => window.clearTimeout(t)
    }
  }, [isInView, prefersReducedMotion, hasMounted])

  const animationProps = useMemo(() => {
    const springConfig = springPresets[spring]

    const effectiveInView = isInView || forceVisible

    // Determine if we should apply spring animation or instant visibility
    const shouldAnimate = hasMounted && effectiveInView && !prefersReducedMotion

    return {
      // NEVER change initial - always false to prevent any initial hidden state
      initial: false,
      // ALWAYS animate to visible state object - never use variant strings
      animate: {
        opacity: 1,
        y: 0,
        x: 0,
        scale: 1,
        transition: shouldAnimate
          ? {
              type: 'spring' as const,
              ...springConfig,
              delay,
            }
          : { duration: 0 },
      },
      // Don't use variants - they can cause state transition issues
      variants: undefined,
    }
  }, [prefersReducedMotion, spring, isInView, forceVisible, delay, hasMounted])

  return {
    ref: ref as RefObject<T>,
    isInView,
    hasMounted,
    forceVisible,
    ...animationProps,
  }
}
