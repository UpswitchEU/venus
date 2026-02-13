/**
 * Hybrid Aurora Design System
 * Animation Variants
 * 
 * Pre-built animation variants for common use cases
 */

import { springPresets } from './useSpring';

// ─────────────────────────────────────────
// ANIMATION VARIANT TYPES
// ─────────────────────────────────────────

export type AnimationVariant = 
  | 'fadeUp' 
  | 'fadeDown' 
  | 'fadeIn' 
  | 'scaleIn' 
  | 'slideLeft' 
  | 'slideRight'
  | 'slideUp'
  | 'slideDown';

// ─────────────────────────────────────────
// ANIMATION VARIANTS
// ─────────────────────────────────────────

export const animationVariants: Record<AnimationVariant, {
  initial: object;
  animate: object;
  exit?: object;
}> = {
  fadeUp: {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, y: 20 },
  },
  fadeDown: {
    initial: { opacity: 0, y: -20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, y: -20 },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { 
      opacity: 1,
      transition: { type: 'spring', ...springPresets.gentle },
    },
    exit: { opacity: 0 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, scale: 0.95 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 40 },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, x: 40 },
  },
  slideRight: {
    initial: { opacity: 0, x: -40 },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, x: -40 },
  },
  slideUp: {
    initial: { opacity: 0, y: 40 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, y: 40 },
  },
  slideDown: {
    initial: { opacity: 0, y: -40 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { type: 'spring', ...springPresets.default },
    },
    exit: { opacity: 0, y: -40 },
  },
};

/**
 * Get animation variant props
 * Returns the initial, animate, and exit props for a given variant
 */
export function getAnimationVariant(variant: AnimationVariant) {
  return animationVariants[variant];
}
