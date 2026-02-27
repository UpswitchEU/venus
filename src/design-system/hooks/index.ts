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
export { useMotionConfig, useReducedMotion } from './useReducedMotion'

// ─────────────────────────────────────────
// SPRING ANIMATIONS
// ─────────────────────────────────────────
export {
  type SpringPreset,
  springPresets,
  useSpringPresets,
  useSpringTransition,
  useSpringValue,
} from './useSpring'

// ─────────────────────────────────────────
// STAGGER ANIMATIONS
// ─────────────────────────────────────────
export {
  type StaggerChildConfig,
  type StaggerConfig,
  useStaggerChild,
  useStaggerContainer,
} from './useStagger'

// ─────────────────────────────────────────
// VIEWPORT ANIMATIONS
// ─────────────────────────────────────────
export {
  type AnimationVariant,
  animationVariants,
  enableMotionDebug,
  useMotionDebug,
  useViewportAnimation,
  type ViewportPreset,
  viewportPresets,
} from './useViewportAnimation'
