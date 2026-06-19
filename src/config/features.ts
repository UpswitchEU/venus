/**
 * Feature Flags Configuration for Valuation Tester
 *
 * Centralized feature flag management for the valuation tester frontend
 */

import { env } from '../utils/env'
import { generalLogger } from '../utils/logger'
import { createRandomToken } from '../utils/secureRandom'

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

  /**
   * BET-312 / BET-325 — the autofill "doors" (connect-accounting /
   * invite-accountant / registry-estimate) in the adaptive method data-plan
   * panel. Off by default: the doors render greyed "coming soon" until BET-312
   * ships the real `fieldsToCollect` routing. Flip per env / Vercel flag UI once
   * the doors exist.
   */
  BET312_AUTOFILL_DOORS: process.env.NEXT_PUBLIC_BET312_AUTOFILL_DOORS === 'true',

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
    10
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
/** BET-312/BET-325 — are the adaptive panel's autofill doors live (vs greyed "coming soon")? */
export const isBet312AutofillDoorsEnabled = (): boolean => FEATURE_FLAGS.BET312_AUTOFILL_DOORS
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
      const bucket = Number.parseInt(createRandomToken(4), 36) % 100
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
/**
 * Studio v2 is now the canonical pre-revenue path — and the standalone
 * `/[locale]/startup-valuation` wizard has been folded into
 * `ManualLayout`'s left rail (see `StartupValuationPanel`) so DCF /
 * SaaS / NAV / Adaptive / Startup all share one shell.  The original
 * rollout flags (Express + AmbitionPicker + TeamPicker era) are
 * retired.
 *
 * These helpers stay as `() => true` so:
 *   - any external caller (older bundle, QA harness, partner SDK)
 *     that still imports them keeps compiling,
 *   - the env vars (`NEXT_PUBLIC_STARTUP_STUDIO_V2*`) become no-ops
 *     instead of breaking on stale Vercel configurations,
 *   - a grep for `FEATURE_FLAGS.STARTUP_STUDIO_V2` still leads here so
 *     a future rollback can re-introduce gradient bucketing without
 *     hunting through git blame.
 *
 * Reference to the underlying flag values is preserved (`void`-cast
 * below) so the linter doesn't flag the now-unused fields.
 *
 * @deprecated Studio v2 is the only path now; all consumers have been
 * removed.  Target removal: 2026-Q3.
 */
export const isStartupStudioV2Enabled = (): boolean => {
  void FEATURE_FLAGS.STARTUP_STUDIO_V2
  void FEATURE_FLAGS.STARTUP_STUDIO_V2_ROLLOUT_PCT
  void getStudioVisitorBucket
  return true
}

/** @deprecated See {@link isStartupStudioV2Enabled}. */
export const isStartupStudioV2RouteEnabled = (): boolean => true

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
