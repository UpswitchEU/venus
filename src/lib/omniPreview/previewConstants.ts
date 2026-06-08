/**
 * Single source of truth for decimal precision in manual “derived metrics” UIs.
 * Keep in sync with display expectations (not necessarily engine internal precision).
 */

export const PREVIEW_DECIMALS = {
  /** SaaS Rule of 40, LTV/CAC, Magic Number, etc. */
  saasMetric: 1,
  /** SDE multiple, ratio-style rows that need two decimals */
  sdeMultiple: 2,
  /** Currency amounts in preview cards (€, whole euros) */
  currency: 0,
  /** EBITDA margin %, revenue-quality ratios */
  ratio: 1,
} as const

export type BelgianLocaleTag = 'en-BE' | 'nl-BE' | 'fr-BE'
