/**
 * Cross-app contract-lock for the Venus ↔ Titan plan/method matrix.
 *
 * Why this exists
 * ----------------
 * Venus carries fallback logic that mirrors Titan's
 * `PRICING_CONFIG[*].features.allowed_methods`:
 *
 *   1. `FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS` — mirrors Titan Free's
 *      `allowed_methods: null` contract ("all methods allowed").
 *   2. `resolveAllowedMethodKeys(undefined, planType)` — assumes every known
 *      tier (`free`, `owner_grow`, `owner_sell`, `starter`, `pro`, `expert`, `enterprise`, `premium`)
 *      returns `null` from Titan. If Titan starts returning a restricted list
 *      for any of these tiers, Venus would silently keep every method unlocked
 *      in the UI until the next deploy lands.
 *
 * The fixture below is the normalized wire projection consumed by Venus. It
 * deliberately avoids importing a sibling checkout: standalone CI must be
 * hermetic, while platform contract verification owns source-to-projection
 * checksum parity across repositories.
 *
 * If you intentionally change Titan's free-tier `allowed_methods` (or any paid
 * tier's `allowed_methods` away from `null`), you MUST update
 * `apps/venus/src/constants/accountantPlanMethods.ts` in the same change
 * set, then redeploy Titan + Venus together to avoid a drift window where
 * the UI and server enforcement disagree on what a user can run.
 */

import { describe, expect, it } from 'vitest'
import {
  FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS,
  isAccountantTierRole,
  resolveAllowedMethodKeys,
} from '../accountantPlanMethods'

type TitanPlanLiteral =
  | 'FREE'
  | 'OWNER_GROW'
  | 'OWNER_SELL'
  | 'STARTER'
  | 'PRO'
  | 'EXPERT'
  | 'ENTERPRISE'
  | 'PREMIUM'

type TitanFeatureName =
  | 'integrations_enabled'
  | 'live_benelux_sector_multiples'
  | 'tax_latencies'
  | 'team_seat_addons'
  | 'valuation_download'
  | 'valuation_synthesis'

const FULL_OWNER_FEATURES: Partial<Record<TitanFeatureName, boolean>> = {
  integrations_enabled: true,
  live_benelux_sector_multiples: true,
  team_seat_addons: false,
  valuation_download: true,
  valuation_synthesis: true,
}

const TITAN_PLAN_WIRE_CONTRACT: Record<
  TitanPlanLiteral,
  {
    allowedMethods: string[] | null
    features: Partial<Record<TitanFeatureName, boolean>>
  }
> = {
  FREE: {
    allowedMethods: null,
    features: {
      integrations_enabled: true,
      tax_latencies: true,
      valuation_download: false,
      valuation_synthesis: false,
    },
  },
  OWNER_GROW: { allowedMethods: null, features: FULL_OWNER_FEATURES },
  OWNER_SELL: { allowedMethods: null, features: FULL_OWNER_FEATURES },
  STARTER: {
    allowedMethods: null,
    features: { integrations_enabled: true, valuation_download: true, valuation_synthesis: true },
  },
  PRO: {
    allowedMethods: null,
    features: { integrations_enabled: true, valuation_download: true, valuation_synthesis: true },
  },
  EXPERT: { allowedMethods: null, features: {} },
  ENTERPRISE: { allowedMethods: null, features: {} },
  PREMIUM: { allowedMethods: null, features: {} },
}

const MERCURY_ADVISOR_ROLE_CONTRACT = ['accountant', 'expert', 'enterprise', 'admin'] as const
const TITAN_PLAN_CONTRACT_REVISION = 'advisor-plan-entitlements.v1'

function extractAllowedMethodsFromTitan(_revision: string, planLiteral: string): string[] | null {
  return TITAN_PLAN_WIRE_CONTRACT[planLiteral as TitanPlanLiteral].allowedMethods
}

function extractBooleanFeatureFromTitan(
  _revision: string,
  planLiteral: string,
  featureName: string
): boolean {
  const value =
    TITAN_PLAN_WIRE_CONTRACT[planLiteral as TitanPlanLiteral].features[
      featureName as TitanFeatureName
    ]
  if (value === undefined) {
    throw new Error(`Feature ${featureName} is absent from ${planLiteral} wire fixture`)
  }
  return value
}

describe('accountantPlanMethods cross-app contract (Venus ↔ Titan)', () => {
  const titanSource = TITAN_PLAN_CONTRACT_REVISION

  it('Free tier `allowed_methods` matches Venus FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS exactly', () => {
    const titanFreeMethods = extractAllowedMethodsFromTitan(titanSource, 'FREE')
    expect(titanFreeMethods).toBeNull()
    expect(FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS).toBeNull()
    expect(resolveAllowedMethodKeys(undefined, 'free')).toBeNull()
  })

  it('Free keeps all methods available while PDF download remains Starter-gated', () => {
    const titanFreeMethods = extractAllowedMethodsFromTitan(titanSource, 'FREE')

    expect(titanFreeMethods).toBeNull()
    expect(extractBooleanFeatureFromTitan(titanSource, 'FREE', 'valuation_download')).toBe(false)
    expect(extractBooleanFeatureFromTitan(titanSource, 'STARTER', 'valuation_download')).toBe(true)
  })

  it.each([
    'OWNER_GROW',
    'OWNER_SELL',
    'STARTER',
    'PRO',
    'EXPERT',
    'ENTERPRISE',
    'PREMIUM',
  ])('Paid tier %s has `allowed_methods: null` (= all methods unlocked)', (planLiteral) => {
    // Venus's `resolveAllowedMethodKeys(undefined, <paidPlan>)` assumes
    // every paid tier returns `null` from Titan. If Titan starts shipping
    // a restricted array for any of these, the assumption breaks — fix
    // BOTH the Titan config and `resolveAllowedMethodKeys` in the same PR.
    const titanMethods = extractAllowedMethodsFromTitan(titanSource, planLiteral)
    expect(titanMethods).toBeNull()
  })

  it.each([
    ['owner_grow', null],
    ['owner_sell', null],
    ['starter', null],
    ['pro', null],
    ['expert', null],
    ['enterprise', null],
    ['premium', null],
  ] as const)("Venus `resolveAllowedMethodKeys(undefined, '%s')` returns %s (matches Titan paid-tier contract)", (planType, expected) => {
    // Closes the loop: not only does Titan return `null` for these
    // tiers, Venus's fallback (when the API field is absent) also
    // collapses to `null`. Without this, a degraded `/credits/plan`
    // response would lock paid users out of paid methods in the UI.
    expect(resolveAllowedMethodKeys(undefined, planType)).toEqual(expected)
  })

  it('owner Grow/Sell and advisor Starter/Pro feature split matches Titan', () => {
    expect(extractBooleanFeatureFromTitan(titanSource, 'FREE', 'tax_latencies')).toBe(true)
    expect(extractBooleanFeatureFromTitan(titanSource, 'FREE', 'integrations_enabled')).toBe(true)
    expect(extractBooleanFeatureFromTitan(titanSource, 'FREE', 'valuation_synthesis')).toBe(false)
    expect(extractBooleanFeatureFromTitan(titanSource, 'FREE', 'valuation_download')).toBe(false)

    for (const planLiteral of ['OWNER_GROW', 'OWNER_SELL'] as const) {
      expect(extractBooleanFeatureFromTitan(titanSource, planLiteral, 'integrations_enabled')).toBe(
        true
      )
      expect(extractBooleanFeatureFromTitan(titanSource, planLiteral, 'valuation_synthesis')).toBe(
        true
      )
      expect(extractBooleanFeatureFromTitan(titanSource, planLiteral, 'valuation_download')).toBe(
        true
      )
      expect(
        extractBooleanFeatureFromTitan(titanSource, planLiteral, 'live_benelux_sector_multiples')
      ).toBe(true)
      expect(extractBooleanFeatureFromTitan(titanSource, planLiteral, 'team_seat_addons')).toBe(
        false
      )
    }

    expect(extractBooleanFeatureFromTitan(titanSource, 'STARTER', 'integrations_enabled')).toBe(
      true
    )
    expect(extractBooleanFeatureFromTitan(titanSource, 'STARTER', 'valuation_synthesis')).toBe(true)
    expect(extractBooleanFeatureFromTitan(titanSource, 'PRO', 'integrations_enabled')).toBe(true)
    expect(extractBooleanFeatureFromTitan(titanSource, 'PRO', 'valuation_synthesis')).toBe(true)
  })

  it('Venus advisor-tier role set matches Mercury ROLES_ALLOWED_ACCOUNTANT_ROUTES exactly', () => {
    // Mercury's `CalculatorRedirectClient` only sets `?mode=accountant` for
    // viewers in `ROLES_ALLOWED_ACCOUNTANT_ROUTES`. Venus's `lib/auth.ts`
    // only fetches client context when `isAccountantTierRole(user.role)` is
    // true. If those two sets diverge, an Expert / Enterprise / Admin user
    // gets `mode=accountant` from Mercury but Venus refuses to fetch the
    // client context, leaving them stuck on AuthGate's "Failed to establish
    // client context" error.
    //
    // Symmetrical Mercury-side guard:
    // `apps/mercury/shared/constants/auth-roles.ts → ROLES_ALLOWED_ACCOUNTANT_ROUTES`.
    // Update both literals + this test in the same change set.
    const mercuryRoles = [...MERCURY_ADVISOR_ROLE_CONTRACT]
    // Sanity: every role Mercury allows for `/advisor/*` must also satisfy
    // Venus's `isAccountantTierRole` predicate (the predicate is what gates
    // client-context fetch in `lib/auth.ts`).
    for (const role of mercuryRoles) {
      expect(
        isAccountantTierRole(role),
        `Role "${role}" is in Mercury ROLES_ALLOWED_ACCOUNTANT_ROUTES but Venus isAccountantTierRole returns false`
      ).toBe(true)
    }
    // And: nothing extra in Venus that Mercury would not authorize for
    // `/advisor/*`. This catches the inverse drift where Venus would render
    // the full advisor nav for a role that Mercury never sends to Venus
    // with `mode=accountant`.
    for (const role of ['accountant', 'expert', 'enterprise', 'admin']) {
      expect(
        mercuryRoles.includes(role),
        `Venus treats "${role}" as advisor-tier but Mercury does not list it in ROLES_ALLOWED_ACCOUNTANT_ROUTES`
      ).toBe(true)
    }
  })

  it('Venus FREE fallback keeps all methods available (snapshot)', () => {
    expect(FREE_ACCOUNTANT_ALLOWED_METHOD_KEYS).toBeNull()
    expect(resolveAllowedMethodKeys(undefined, 'free')).toBeNull()
  })
})
