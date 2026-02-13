/**
 * Hybrid Aurora Design System
 * Framer Motion Presets
 * 
 * Physics-based spring animations for natural, premium feel
 */

import type { Transition, Variants } from 'framer-motion'

// ─────────────────────────────────────────
// SPRING CONFIGURATIONS
// ─────────────────────────────────────────

/** Default spring - balanced feel */
export const springDefault: Transition = {
  type: 'spring',
  stiffness: 170,
  damping: 26,
  mass: 1,
}

/** Snappy spring - quick response */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 1,
}

/** Gentle spring - smooth, elegant */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
  mass: 1,
}

/** Bouncy spring - playful */
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 15,
  mass: 1,
}

// ─────────────────────────────────────────
// DURATION PRESETS
// ─────────────────────────────────────────

export const duration = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.5,
  slower: 0.8,
} as const

// ─────────────────────────────────────────
// EASING PRESETS
// ─────────────────────────────────────────

export const easing = {
  /** Smooth ease out */
  out: [0.4, 0, 0.2, 1],
  /** Smooth ease in */
  in: [0.4, 0, 1, 1],
  /** Smooth ease in-out */
  inOut: [0.4, 0, 0.2, 1],
  /** Spring-like cubic bezier */
  spring: [0.34, 1.56, 0.64, 1],
} as const

// ─────────────────────────────────────────
// VARIANT PRESETS
// ─────────────────────────────────────────

/** Fade in from bottom */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springDefault,
  },
}

/** Fade in from top */
export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springDefault,
  },
}

/** Scale in */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springDefault,
  },
}

/** Stagger children animation */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

/** Fast stagger children animation */
export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
}

/** Slide in from left */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: springDefault,
  },
}

/** Slide in from right */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: springDefault,
  },
}

// ─────────────────────────────────────────
// HOVER PRESETS
// ─────────────────────────────────────────

/** Subtle lift on hover */
export const hoverLift = {
  y: -2,
  transition: springSnappy,
}

/** Scale up on hover */
export const hoverScale = {
  scale: 1.02,
  transition: springSnappy,
}

/** Glow effect on hover */
export const hoverGlow = {
  boxShadow: '0 0 20px rgba(var(--primary), 0.3)',
  transition: springSnappy,
}

// ─────────────────────────────────────────
// TAP PRESETS
// ─────────────────────────────────────────

/** Scale down on tap */
export const tapScale = {
  scale: 0.98,
  transition: springSnappy,
}

// ─────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────

/** Create stagger delay for index */
export const staggerDelay = (index: number, baseDelay = 0.1): number => {
  return index * baseDelay
}

/** Viewport animation configuration */
export const viewportConfig = {
  once: true,
  margin: '-100px 0px',
  amount: 0.3,
} as const

/** Create custom spring configuration */
export const createSpring = (
  stiffness: number = 170,
  damping: number = 26,
  mass: number = 1
): Transition => ({
  type: 'spring',
  stiffness,
  damping,
  mass,
})
