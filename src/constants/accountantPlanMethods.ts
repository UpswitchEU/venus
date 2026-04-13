/**
 * Mirrors Titan `PRICING_CONFIG[free].features.allowed_methods` — keep in sync with
 * apps/titan-api/src/billing/config/pricing.config.ts
 */
export const FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS = [
  'upswitch_adaptive',
  'dcf',
  'ebitda_multiple',
  'adjusted_nav',
] as const

/** Trim + lowercase; empty input resolves like Titan free tier. */
export function normalizeAccountantPlanTypeKey(planType: string | undefined): string {
  if (planType == null || planType === '') return 'free'
  return planType.trim().toLowerCase()
}

/**
 * Free PLG tier and Starter — Titan defaults keep `integrations_enabled: false`.
 * Venus uses the same integration-entry upsell + manual path for both (not Pro+ live import).
 * Same predicate as Mercury `isAccountantFreeOrStarterTier` (`shared/utils/billing/plan-helpers.ts`).
 */
export function isAccountantFreeOrStarterTier(planType: string | undefined): boolean {
  const p = normalizeAccountantPlanTypeKey(planType)
  return p === 'free' || p === 'starter'
}

/**
 * @param allowedFromApi - from GET /api/v2/credits/plan `allowed_methods`; omit if unknown
 * @param planType - user plan_type when API omits allowed_methods
 */
export function resolveAllowedMethodKeys(
  allowedFromApi: string[] | null | undefined,
  planType: string | undefined
): string[] | null {
  if (allowedFromApi !== undefined && allowedFromApi !== null) {
    return allowedFromApi
  }
  const pt = (planType || 'free').toLowerCase()
  if (pt === 'free') return [...FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS]
  if (['starter', 'pro', 'expert', 'enterprise', 'premium'].includes(pt)) return null
  return null
}
