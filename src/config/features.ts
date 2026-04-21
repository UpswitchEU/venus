/**
 * Feature Flags Configuration for Valuation Tester
 *
 * Centralized feature flag management for the valuation tester frontend
 */

import { env } from '../utils/env'
import { generalLogger } from '../utils/logger'

export const FEATURE_FLAGS = {
  // Credit System Flags
  UNLIMITED_CREDITS_MODE: env.NEXT_PUBLIC_UNLIMITED_CREDITS_MODE === 'true',
  SHOW_CREDIT_BADGE: process.env.NEXT_PUBLIC_SHOW_CREDIT_BADGE !== 'false',
  SHOW_USAGE_STATS: process.env.NEXT_PUBLIC_SHOW_USAGE_STATS === 'true',
  ENABLE_PREMIUM_UPSELL: process.env.NEXT_PUBLIC_ENABLE_PREMIUM_UPSELL === 'true',

  // UI/UX Flags
  SHOW_ONBOARDING_TOOLTIPS: process.env.NEXT_PUBLIC_SHOW_ONBOARDING_TOOLTIPS !== 'false',
  ENABLE_ANIMATIONS: process.env.NEXT_PUBLIC_ENABLE_ANIMATIONS !== 'false',
  SHOW_CREDIT_ANALYTICS: process.env.NEXT_PUBLIC_SHOW_CREDIT_ANALYTICS === 'true',
  /** "Sneller met grootboek upload?" CTA in valuation left panel. */
  SHOW_LEDGER_UPLOAD_HINT: process.env.NEXT_PUBLIC_SHOW_LEDGER_UPLOAD_HINT !== 'false',

  // Session & Persistence Flags
  ENABLE_SESSION_RESTORATION: process.env.NEXT_PUBLIC_ENABLE_SESSION_RESTORATION !== 'false', // Default: enabled

  // Development Flags
  DEBUG_CREDIT_SYSTEM: process.env.NEXT_PUBLIC_DEBUG_CREDIT_SYSTEM === 'true',
  MOCK_CREDIT_DATA: process.env.NEXT_PUBLIC_MOCK_CREDIT_DATA === 'true',

  /**
   * Studio v2 — full-screen valuation wizard at `/[locale]/startup-valuation`.
   * When enabled, `StartupAwareInputPanel` and the `?method=startup_valuation`
   * deep-link redirect founders into the new wizard instead of the cramped
   * 35%-rail slider panel.  Off by default during the 3-sprint rollout
   * (10% → 100%); flip to `true` per env or via Vercel feature-flag UI.
   */
  STARTUP_STUDIO_V2: process.env.NEXT_PUBLIC_STARTUP_STUDIO_V2 === 'true',

  /**
   * Studio v2 — percentage rollout (0–100). When > 0, `isStartupStudioV2Enabled`
   * deterministically buckets the visitor (via a hashed visitor id stored in
   * `localStorage`) and returns `true` only when the bucket is below the
   * threshold. Defaults to `0` so the global flag above is the canonical
   * gate; bump to `10` then `50` then `100` over two weeks.
   */
  STARTUP_STUDIO_V2_ROLLOUT_PCT: Number.parseInt(
    process.env.NEXT_PUBLIC_STARTUP_STUDIO_V2_ROLLOUT_PCT ?? '0',
    10,
  ),
}

// Helper functions for feature flag checks
export const isUnlimitedCreditsMode = (): boolean => FEATURE_FLAGS.UNLIMITED_CREDITS_MODE
export const shouldShowCreditBadge = (): boolean => FEATURE_FLAGS.SHOW_CREDIT_BADGE
export const shouldShowUsageStats = (): boolean => FEATURE_FLAGS.SHOW_USAGE_STATS
export const shouldEnablePremiumUpsell = (): boolean => FEATURE_FLAGS.ENABLE_PREMIUM_UPSELL
export const shouldShowOnboardingTooltips = (): boolean => FEATURE_FLAGS.SHOW_ONBOARDING_TOOLTIPS
export const shouldEnableAnimations = (): boolean => FEATURE_FLAGS.ENABLE_ANIMATIONS
export const shouldShowCreditAnalytics = (): boolean => FEATURE_FLAGS.SHOW_CREDIT_ANALYTICS
export const shouldShowLedgerUploadHint = (): boolean => FEATURE_FLAGS.SHOW_LEDGER_UPLOAD_HINT
export const shouldEnableSessionRestoration = (): boolean =>
  FEATURE_FLAGS.ENABLE_SESSION_RESTORATION
export const isDebugCreditSystem = (): boolean => FEATURE_FLAGS.DEBUG_CREDIT_SYSTEM
export const shouldMockCreditData = (): boolean => FEATURE_FLAGS.MOCK_CREDIT_DATA
/**
 * Stable visitor bucket in [0, 100). Persisted in localStorage so a
 * single visitor never flips between Studio v2 and the legacy panel
 * across sessions (which would be terrible for the A/B comparison).
 *
 * Returns `null` when localStorage is unavailable (SSR, Safari ITP,
 * incognito) — callers fall back to the deterministic global flag in
 * that case so we never block a return user.
 */
function getStudioVisitorBucket(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const KEY = 'upswitch.studio.bucket'
    let raw = window.localStorage.getItem(KEY)
    if (!raw) {
      const bucket = Math.floor(Math.random() * 100)
      raw = String(bucket)
      window.localStorage.setItem(KEY, raw)
    }
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Client-side decision: should *this visitor* be redirected from the
 * legacy slider panel into the Studio v2 wizard?  Reads from
 * `localStorage` for stable bucketing, so this MUST be invoked client-
 * side (inside an effect or event handler).  Server invocation always
 * returns `false` because there is no bucket yet — that is intentional;
 * only a deterministic, render-stable answer is allowed during SSR.
 */
export const isStartupStudioV2Enabled = (): boolean => {
  if (FEATURE_FLAGS.STARTUP_STUDIO_V2) return true
  const pct = FEATURE_FLAGS.STARTUP_STUDIO_V2_ROLLOUT_PCT
  if (!Number.isFinite(pct) || pct <= 0) return false
  if (pct >= 100) return true
  const bucket = getStudioVisitorBucket()
  if (bucket === null) return false
  return bucket < pct
}

/**
 * Server-side gate for the `/[locale]/startup-valuation` route.
 *
 * Bucketing happens client-side, so a server check that depends on
 * `localStorage` would 404 every visitor outside a 100% rollout.
 * Instead, the route is "open" the moment any rollout exists at all
 * (`STARTUP_STUDIO_V2 === true` OR `pct > 0`).  Visitors outside the
 * bucket simply will not be redirected here from the legacy panel, but
 * the page itself remains directly addressable for QA and partner
 * landing pages.
 *
 * Safe to call from server components.
 */
export const isStartupStudioV2RouteEnabled = (): boolean => {
  if (FEATURE_FLAGS.STARTUP_STUDIO_V2) return true
  const pct = FEATURE_FLAGS.STARTUP_STUDIO_V2_ROLLOUT_PCT
  return Number.isFinite(pct) && pct > 0
}

// Environment-specific configurations
export const getEnvironmentConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    isDevelopment,
    isProduction,
    apiUrl:
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'https://valuation.upswitch.app',
    creditApiUrl:
      process.env.NEXT_PUBLIC_CREDIT_API_URL || 'https://valuation.upswitch.app/api/credits',
  }
}

// Feature flag validation
export const validateFeatureFlags = () => {
  const warnings: string[] = []

  if (FEATURE_FLAGS.UNLIMITED_CREDITS_MODE && FEATURE_FLAGS.ENABLE_PREMIUM_UPSELL) {
    warnings.push(
      'Unlimited credits mode is enabled but premium upselling is also enabled. This may confuse users.'
    )
  }

  if (FEATURE_FLAGS.SHOW_CREDIT_ANALYTICS && !FEATURE_FLAGS.SHOW_USAGE_STATS) {
    warnings.push(
      'Credit analytics are enabled but usage stats are disabled. Analytics may not display properly.'
    )
  }

  if (FEATURE_FLAGS.DEBUG_CREDIT_SYSTEM && process.env.NODE_ENV === 'production') {
    warnings.push('Debug mode is enabled in production. This should be disabled.')
  }

  return warnings
}

// Log feature flags on startup (development only)
if (process.env.NODE_ENV === 'development') {
  generalLogger.info('Valuation Tester Feature Flags loaded', FEATURE_FLAGS)
  const warnings = validateFeatureFlags()
  if (warnings.length > 0) {
    generalLogger.warn('Feature Flag validation warnings', { warnings })
  }
}
