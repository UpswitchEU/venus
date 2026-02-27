/**
 * Hybrid Aurora Design System
 * Stagger Animation Utilities
 *
 * Utilities for creating staggered animations in lists
 */

import { useMemo } from 'react'
import { useReducedMotion } from './useReducedMotion'
import { type SpringPreset, springPresets } from './useSpring'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface StaggerConfig {
  /** Delay between items in seconds */
  staggerChildren?: number
  /** Delay before starting children animation */
  delayChildren?: number
  /** Spring preset for children */
  spring?: SpringPreset
}

// ─────────────────────────────────────────
// STAGGER CONTAINER HOOK
// ─────────────────────────────────────────

/**
 * Hook for stagger container animations
 * Returns variants for use with motion components
 */
export function useStaggerContainer(config: StaggerConfig = {}) {
  const { staggerChildren = 0.05, delayChildren = 0, spring = 'default' } = config

  const prefersReducedMotion = useReducedMotion()

  return useMemo(() => {
    if (prefersReducedMotion) {
      return {
        hidden: {},
        visible: {},
      }
    }

    return {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren,
          delayChildren,
        },
      },
    }
  }, [staggerChildren, delayChildren, prefersReducedMotion])
}

// ─────────────────────────────────────────
// STAGGER CHILD HOOK
// ─────────────────────────────────────────

export interface StaggerChildConfig {
  /** Animation variant */
  variant?: 'fadeUp' | 'fadeDown' | 'fadeIn' | 'scaleIn' | 'slideLeft' | 'slideRight'
  /** Spring preset */
  spring?: SpringPreset
  /** Custom delay for this child */
  delay?: number
}

/**
 * Hook for stagger child animations
 * Returns variants for use with motion components
 */
export function useStaggerChild(config: StaggerChildConfig = {}) {
  const { variant = 'fadeUp', spring = 'default', delay = 0 } = config

  const prefersReducedMotion = useReducedMotion()
  const springConfig = springPresets[spring]

  return useMemo(() => {
    if (prefersReducedMotion) {
      return {
        hidden: { opacity: 1 },
        visible: { opacity: 1 },
      }
    }

    const variants: Record<string, { hidden: object; visible: object }> = {
      fadeUp: {
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { ...springConfig, delay },
        },
      },
      fadeDown: {
        hidden: { opacity: 0, y: -20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { ...springConfig, delay },
        },
      },
      fadeIn: {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { ...springConfig, delay },
        },
      },
      scaleIn: {
        hidden: { opacity: 0, scale: 0.95 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { ...springConfig, delay },
        },
      },
      slideLeft: {
        hidden: { opacity: 0, x: 20 },
        visible: {
          opacity: 1,
          x: 0,
          transition: { ...springConfig, delay },
        },
      },
      slideRight: {
        hidden: { opacity: 0, x: -20 },
        visible: {
          opacity: 1,
          x: 0,
          transition: { ...springConfig, delay },
        },
      },
    }

    return variants[variant] || variants.fadeUp
  }, [variant, springConfig, delay, prefersReducedMotion])
}
