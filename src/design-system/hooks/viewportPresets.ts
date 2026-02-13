/**
 * Hybrid Aurora Design System
 * Viewport Animation Presets
 * 
 * Configuration for scroll-triggered animations
 */

// ─────────────────────────────────────────
// VIEWPORT PRESETS
// ─────────────────────────────────────────

export type ViewportPreset = 'default' | 'eager' | 'lazy' | 'center';

export interface ViewportConfig {
  /** Margin around viewport to trigger */
  margin: string;
  /** Amount of element visible before triggering (0-1 or 'some' | 'all') */
  amount: number | 'some' | 'all';
}

export const viewportPresets: Record<ViewportPreset, ViewportConfig> = {
  /** Default: triggers when 20% visible, with small margin */
  default: {
    margin: '-50px 0px -50px 0px',
    amount: 0.2,
  },
  /** Eager: triggers early, before element is visible */
  eager: {
    margin: '100px 0px 100px 0px',
    amount: 0,
  },
  /** Lazy: triggers when mostly visible */
  lazy: {
    margin: '-100px 0px -100px 0px',
    amount: 0.6,
  },
  /** Center: triggers when centered in viewport */
  center: {
    margin: '-25% 0px -25% 0px',
    amount: 0.5,
  },
};
