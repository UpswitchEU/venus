/**
 * Hybrid Aurora Design System
 * Motion Hooks
 * 
 * Accessibility-aware animation utilities that respect
 * user preferences for reduced motion.
 * 
 * @module hooks
 */

// ─────────────────────────────────────────
// REDUCED MOTION
// ─────────────────────────────────────────
export { useReducedMotion, useMotionConfig } from './useReducedMotion';

// ─────────────────────────────────────────
// SPRING ANIMATIONS
// ─────────────────────────────────────────
export { 
  useSpringValue, 
  useSpringTransition, 
  useSpringPresets,
  springPresets,
  type SpringPreset,
} from './useSpring';

// ─────────────────────────────────────────
// STAGGER ANIMATIONS
// ─────────────────────────────────────────
export {
  useStaggerContainer,
  useStaggerChild,
  type StaggerConfig,
  type StaggerChildConfig,
} from './useStagger';

// ─────────────────────────────────────────
// VIEWPORT ANIMATIONS
// ─────────────────────────────────────────
export { 
  useViewportAnimation,
  enableMotionDebug,
  useMotionDebug,
  viewportPresets,
  animationVariants,
  type ViewportPreset,
  type AnimationVariant,
} from './useViewportAnimation';
