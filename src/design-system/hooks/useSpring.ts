/**
 * Hybrid Aurora Design System
 * Spring Utilities
 * 
 * Physics-based spring animation presets and hooks
 */

import { useSpring as useFramerSpring, type SpringOptions } from 'framer-motion';
import { useMemo } from 'react';
import { useReducedMotion } from './useReducedMotion';

// ─────────────────────────────────────────
// SPRING PRESETS
// ─────────────────────────────────────────

export type SpringPreset = 'default' | 'snappy' | 'gentle' | 'bouncy';

export const springPresets: Record<SpringPreset, SpringOptions> = {
  /** Default spring - balanced, natural feel */
  default: {
    stiffness: 170,
    damping: 26,
    mass: 1,
  },
  /** Snappy spring - quick, responsive */
  snappy: {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  },
  /** Gentle spring - slow, smooth */
  gentle: {
    stiffness: 100,
    damping: 20,
    mass: 1.2,
  },
  /** Bouncy spring - playful, elastic */
  bouncy: {
    stiffness: 400,
    damping: 15,
    mass: 0.6,
  },
};

// ─────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────

/**
 * Animated spring value with accessibility support
 * Returns a MotionValue that animates to target using spring physics
 */
export function useSpringValue(
  target: number,
  preset: SpringPreset = 'default'
) {
  const prefersReducedMotion = useReducedMotion();
  
  const config = useMemo(() => {
    if (prefersReducedMotion) {
      return { stiffness: 1000, damping: 100, mass: 0.1 }; // Instant
    }
    return springPresets[preset];
  }, [preset, prefersReducedMotion]);

  return useFramerSpring(target, config);
}

/**
 * Spring config hook with accessibility support
 * Returns the appropriate spring config based on preference
 */
export function useSpringPresets() {
  const prefersReducedMotion = useReducedMotion();

  return useMemo(() => {
    if (prefersReducedMotion) {
      // Return instant configs for reduced motion
      const instant = { stiffness: 1000, damping: 100, mass: 0.1 };
      return {
        default: instant,
        snappy: instant,
        gentle: instant,
        bouncy: instant,
      };
    }
    return springPresets;
  }, [prefersReducedMotion]);
}

/**
 * Spring transition hook
 * Returns a transition object ready for use with Framer Motion
 */
export function useSpringTransition(preset: SpringPreset = 'default') {
  const prefersReducedMotion = useReducedMotion();
  
  return useMemo(() => {
    if (prefersReducedMotion) {
      return { type: 'tween' as const, duration: 0 };
    }
    return {
      type: 'spring' as const,
      ...springPresets[preset],
    };
  }, [preset, prefersReducedMotion]);
}
