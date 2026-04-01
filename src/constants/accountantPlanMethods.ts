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
