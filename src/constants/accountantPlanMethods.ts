/**
 * Mirrors Titan `PRICING_CONFIG[free].features.allowed_methods` — keep in sync with
 * apps/titan-api/src/billing/config/pricing.config.ts
 *
 * NOTE: ``arr_multiple`` and ``startup_valuation`` are part of the Free tier so
 * pre-revenue founders + business owners can run the SaaS / Startup paths without
 * upgrading. Both methods are non-combinable in the synthesis flow.
 *
 * ``liquidation_analysis`` shares the balance-sheet input contract with
 * ``adjusted_nav``; gating it differently from NAV would be confusing UX.
 */
export const FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS = [
  'upswitch_adaptive',
  'dcf',
  'ebitda_multiple',
  'adjusted_nav',
  'arr_multiple',
  'startup_valuation',
  'liquidation_analysis',
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

/**
 * Roles that always see the full advisor method list (no owner-founder filter).
 * Mirrors Mercury `ACCOUNTANT_TIER_ROLES` (`shared/constants/auth-roles.ts`)
 * — `admin` is included so Upswitch staff debugging client sessions are not
 * accidentally restricted to the 3-method founder list. Keep these two
 * literals in sync; the matrix is part of the cross-app role contract.
 */
const ACCOUNTANT_TIER_ROLE_KEYS = new Set<string>(['accountant', 'expert', 'enterprise', 'admin'])

/**
 * True when the user's role grants the full advisor method navigation.
 *
 * Why this exists: `filterPreSelectableMethodsForOwnerFounder` historically
 * keyed off `isAccountantFlow` (= `identity.type === 'accountant_for_client'`),
 * which is only true on the **client-context** path (URL `clientToken=` or
 * `mode=accountant&clientId=`). An accountant who opens the standalone
 * `/calculator` (no client) was therefore wrongly restricted to the 3 owner
 * methods — losing DCF / EBITDA-multiple / NAV / fiscal entries from their
 * own nav. Pair this guard with `isAccountantFlow` so we light up the full
 * list for **any** advisor surface.
 */
export function isAccountantTierRole(role: string | null | undefined): boolean {
  if (typeof role !== 'string') return false
  const normalized = role.trim().toLowerCase()
  return ACCOUNTANT_TIER_ROLE_KEYS.has(normalized)
}

/**
 * Single source of truth for “advisor-tier” calculator UX: full method nav,
 * `StartupValuationPanel` advisor mode, and hiding the founder-only startup
 * dashboard — as opposed to PLG business owners / founders.
 *
 * Pass `isAccountantForClient` from bootstrap (`identity.type ===
 * 'accountant_for_client'`). When bootstrap is unavailable (tests), pass
 * `false` and rely on `userRole` alone.
 */
export function showAdvisorCalculatorSurface(
  isAccountantForClient: boolean,
  userRole: string | null | undefined
): boolean {
  return isAccountantForClient || isAccountantTierRole(userRole)
}

/**
 * Nav methods shown to owners; accountants keep full firm list.
 *
 * `showFullAdvisorList` should be `true` whenever the *current viewer* is an
 * accountant-tier role **or** is acting on behalf of a client. Prefer
 * {@link showAdvisorCalculatorSurface} at call sites so startup panel mode
 * and nav stay aligned.
 */
export function filterPreSelectableMethodsForOwnerFounder(
  methods: readonly string[],
  showFullAdvisorList: boolean
): readonly string[] {
  if (showFullAdvisorList) return methods
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
  if (['starter', 'pro', 'expert', 'enterprise', 'premium'].includes(pt)) return null
  return [...FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS]
}
