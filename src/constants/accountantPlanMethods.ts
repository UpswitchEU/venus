/**
 * Mirrors Titan `PRICING_CONFIG[free].features.allowed_methods` — keep in sync with
 * apps/titan-api/src/billing/config/pricing.config.ts
 *
 * NOTE: ``arr_multiple`` and ``startup_valuation`` are part of the Free tier so
 * pre-revenue founders + business owners can run the SaaS / Startup paths without
 * upgrading. Both methods are non-combinable in the synthesis flow.
 */
export const FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS = [
  'upswitch_adaptive',
  'dcf',
  'ebitda_multiple',
  'adjusted_nav',
  'arr_multiple',
  'startup_valuation',
] as const

/**
 * Business owners / founders in Venus (non-accountant flow): Light Venus + startup campaign.
 * Intersected with firm-level preselect list so NL still drops fiscal_4x, etc.
 */
export const OWNER_FOUNDER_METHOD_KEYS = [
  'upswitch_adaptive',
  'arr_multiple',
  'startup_valuation',
] as const

/** Nav methods shown to owners; accountants keep full firm list. */
export function filterPreSelectableMethodsForOwnerFounder(
  methods: readonly string[],
  isAccountantFlow: boolean
): readonly string[] {
  if (isAccountantFlow) return methods
  const allow = new Set<string>(OWNER_FOUNDER_METHOD_KEYS)
  return methods.filter((m) => allow.has(m))
}

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
 *
 * Returning `null` means "all methods allowed" (paid tiers). For unknown
 * plan strings we fall back to the Free-tier restricted list so a typo or
 * a new tier name added on the backend does NOT accidentally unlock paid
 * methods in the UI before the matching Venus deploy lands. Server-side
 * `CreditAPI.saveValuation` is still authoritative and will 402 on
 * insufficient credits regardless of what the UI shows.
 */
export function resolveAllowedMethodKeys(
  allowedFromApi: string[] | null | undefined,
  planType: string | undefined
): string[] | null {
  if (allowedFromApi !== undefined && allowedFromApi !== null) {
    return allowedFromApi
  }
  const pt = (planType || 'free').toLowerCase()
  if (['starter', 'pro', 'expert', 'enterprise', 'premium'].includes(pt))
    return null
  return [...FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS]
}
