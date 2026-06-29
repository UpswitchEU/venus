/**
 * Mirrors Titan `PRICING_CONFIG[free].features.allowed_methods` — `null` means
 * "all methods allowed". Keep in sync with
 * apps/titan-api/src/billing/config/pricing.config.ts.
 */
export const FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS: string[] | null = null

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
  const key = planType.trim().toLowerCase()
  // Legacy advisor upgrade tokens predate the Starter/Pro split. Treat generic paid
  // aliases as Starter-level so Venus unlocks file/manual workflows without granting
  // Pro-only live integration affordances during first-paint or degraded plan reads.
  switch (key) {
    case 'accountant_free':
      return 'free'
    case 'accountant_paid':
    case 'accountant_pro':
    case 'accountant_starter':
      return 'starter'
    case 'accountant_expert':
      return 'expert'
    case 'accountant_enterprise':
      return 'enterprise'
    default:
      return key
  }
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
 * Returning `null` means "all methods allowed". Titan currently resolves Free,
 * paid tiers, and unknown legacy plan strings to configs whose
 * `allowed_methods` are `null`; Venus mirrors that fallback so degraded
 * `/credits/plan` responses do not invent stricter UI locks than server
 * enforcement. Server-side `CreditAPI.saveValuation` is still authoritative
 * and will 402 on insufficient credits regardless of what the UI shows.
 */
export function resolveAllowedMethodKeys(
  allowedFromApi: string[] | null | undefined,
  _planType: string | undefined
): string[] | null {
  if (allowedFromApi !== undefined) {
    return allowedFromApi
  }
  return FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS
}
