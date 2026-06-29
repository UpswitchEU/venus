import { describe, expect, it } from 'vitest'
import {
  filterPreSelectableMethodsForOwnerFounder,
  isAccountantFreeOrStarterTier,
  isAccountantTierRole,
  normalizeAccountantPlanTypeKey,
  OWNER_FOUNDER_METHOD_KEYS,
  planGrantsAdvisorProValuationAccess,
  resolveAllowedMethodKeys,
  showAdvisorCalculatorSurface,
  showFullValuationMethodAccess,
} from './accountantPlanMethods'

describe('normalizeAccountantPlanTypeKey', () => {
  it('treats empty and undefined as free', () => {
    expect(normalizeAccountantPlanTypeKey(undefined)).toBe('free')
    expect(normalizeAccountantPlanTypeKey('')).toBe('free')
  })
  it('trims and lowercases', () => {
    expect(normalizeAccountantPlanTypeKey('  Pro  ')).toBe('pro')
  })
  it('normalizes legacy accountant aliases to safe launch tiers', () => {
    expect(normalizeAccountantPlanTypeKey('accountant_free')).toBe('free')
    expect(normalizeAccountantPlanTypeKey('accountant_paid')).toBe('starter')
    expect(normalizeAccountantPlanTypeKey('accountant_pro')).toBe('starter')
    expect(normalizeAccountantPlanTypeKey('accountant_expert')).toBe('expert')
    expect(normalizeAccountantPlanTypeKey('accountant_enterprise')).toBe('enterprise')
  })
  it('normalizes owner launch aliases to canonical lifecycle tiers', () => {
    expect(normalizeAccountantPlanTypeKey('owner_free')).toBe('free')
    expect(normalizeAccountantPlanTypeKey('grow')).toBe('owner_grow')
    expect(normalizeAccountantPlanTypeKey('owner_grow')).toBe('owner_grow')
    expect(normalizeAccountantPlanTypeKey('sell')).toBe('owner_sell')
    expect(normalizeAccountantPlanTypeKey('premium')).toBe('owner_sell')
  })
})

describe('isAccountantFreeOrStarterTier', () => {
  it('is true for free and starter', () => {
    expect(isAccountantFreeOrStarterTier('free')).toBe(true)
    expect(isAccountantFreeOrStarterTier('starter')).toBe(true)
    expect(isAccountantFreeOrStarterTier('STARTER')).toBe(true)
    expect(isAccountantFreeOrStarterTier('accountant_free')).toBe(true)
    expect(isAccountantFreeOrStarterTier('accountant_paid')).toBe(true)
    expect(isAccountantFreeOrStarterTier('accountant_pro')).toBe(true)
  })
  it('is false for pro and other paid tiers', () => {
    expect(isAccountantFreeOrStarterTier('pro')).toBe(false)
    expect(isAccountantFreeOrStarterTier('premium')).toBe(false)
    expect(isAccountantFreeOrStarterTier('accountant_expert')).toBe(false)
  })
})

describe('resolveAllowedMethodKeys', () => {
  it('returns null (all methods) when API omits allowed_methods for free', () => {
    expect(resolveAllowedMethodKeys(undefined, 'free')).toBeNull()
  })

  // Cross-app contract: every known tier currently resolves to `null`
  // (= "all methods allowed"). Returning a restricted allowlist for any of
  // these would silently lock down UI before the next deploy of Titan's
  // `/credits/plan` ships an explicit `allowed_methods` array.
  it.each([
    'starter',
    'pro',
    'expert',
    'enterprise',
    'premium',
  ])('returns null (all methods) for paid tier %s when API omits allowed_methods', (planType) => {
    expect(resolveAllowedMethodKeys(undefined, planType)).toBeNull()
  })

  it('respects an explicit allowlist from the API even on paid tiers', () => {
    const explicit = ['upswitch_adaptive', 'dcf']
    expect(resolveAllowedMethodKeys(explicit, 'pro')).toEqual(explicit)
    // null = explicit "no restriction" from API; preserve as null
    expect(resolveAllowedMethodKeys(null, 'pro')).toBeNull()
  })

  it('falls back like Titan for unknown plan strings', () => {
    // Titan maps unknown plan_type values to Free, and Free currently has
    // `allowed_methods: null`. Venus mirrors that server-side fallback.
    expect(resolveAllowedMethodKeys(undefined, 'mystery_tier')).toBeNull()
  })
})

describe('OWNER_FOUNDER_METHOD_KEYS', () => {
  it('keeps three methods for non-accountant nav', () => {
    expect(OWNER_FOUNDER_METHOD_KEYS.length).toBe(3)
    const all = [
      'upswitch_adaptive',
      'dcf',
      'ebitda_multiple',
      'adjusted_nav',
      'fiscal_4x',
      'arr_multiple',
      'startup_valuation',
    ]
    const filtered = filterPreSelectableMethodsForOwnerFounder(all, false)
    expect(filtered).toEqual(['upswitch_adaptive', 'arr_multiple', 'startup_valuation'])
  })
  it('does not filter for accountant flow', () => {
    const all = ['dcf', 'upswitch_adaptive']
    expect(filterPreSelectableMethodsForOwnerFounder(all, true)).toEqual(all)
  })
})

describe('showAdvisorCalculatorSurface', () => {
  it('is true when acting for a client even if role is a business-owner key', () => {
    expect(showAdvisorCalculatorSurface(true, 'seller')).toBe(true)
  })
  it('is true for advisor-tier role without client context (standalone calculator)', () => {
    expect(showAdvisorCalculatorSurface(false, 'accountant')).toBe(true)
    expect(showAdvisorCalculatorSurface(false, 'admin')).toBe(true)
  })
  it('is false for PLG / business-owner viewers', () => {
    expect(showAdvisorCalculatorSurface(false, 'seller')).toBe(false)
    expect(showAdvisorCalculatorSurface(false, null)).toBe(false)
    expect(showAdvisorCalculatorSurface(false, undefined)).toBe(false)
  })
})

describe('planGrantsAdvisorProValuationAccess', () => {
  it.each([
    'grow',
    'owner_grow',
    'sell',
    'owner_sell',
    'premium',
    'pro',
    'expert',
    'enterprise',
  ])('grants Pro valuation access for %s', (planType) => {
    expect(planGrantsAdvisorProValuationAccess(planType)).toBe(true)
  })

  it.each([
    'free',
    'owner_free',
    'starter',
    'accountant_paid',
    'accountant_pro',
    null,
    undefined,
  ])('does not grant Pro valuation access for %s', (planType) => {
    expect(planGrantsAdvisorProValuationAccess(planType)).toBe(false)
  })
})

describe('showFullValuationMethodAccess', () => {
  it('lets a Grow business owner use the full advisor valuation method surface', () => {
    expect(
      showFullValuationMethodAccess({
        isAccountantForClient: false,
        planType: 'owner_grow',
        userRole: 'seller',
      })
    ).toBe(true)
    expect(showAdvisorCalculatorSurface(false, 'seller')).toBe(false)
  })

  it('keeps a Free business owner on the founder method surface', () => {
    expect(
      showFullValuationMethodAccess({
        isAccountantForClient: false,
        planType: 'free',
        userRole: 'seller',
      })
    ).toBe(false)
  })

  it('still grants full valuation access for advisor audience roles', () => {
    expect(
      showFullValuationMethodAccess({
        isAccountantForClient: false,
        planType: 'free',
        userRole: 'accountant',
      })
    ).toBe(true)
  })
})

describe('isAccountantTierRole', () => {
  // Mirrors Mercury `ACCOUNTANT_TIER_ROLES` + admin (cross-app contract).
  // Bug history: Venus previously gated the full advisor method nav purely
  // on `isAccountantFlow` (= `identity.type === 'accountant_for_client'`),
  // so an `accountant`/`expert`/`enterprise` user opening the standalone
  // `/calculator` (no client context) was demoted to the 3-method founder
  // nav. These tests pin the role contract that fixes the regression.
  it.each([
    'accountant',
    'expert',
    'enterprise',
    'admin',
  ])('recognises advisor-tier role %s', (role) => {
    expect(isAccountantTierRole(role)).toBe(true)
  })
  it.each([
    'seller',
    'buyer',
    'guest',
    '',
    null,
    undefined,
  ])('rejects non-advisor input %s', (role) => {
    expect(isAccountantTierRole(role as string | null | undefined)).toBe(false)
  })
  it('is case-insensitive and trims whitespace (defensive against API drift)', () => {
    expect(isAccountantTierRole('  Accountant  ')).toBe(true)
    expect(isAccountantTierRole('EXPERT')).toBe(true)
  })
  it('keeps the full advisor method list when paired with `isAccountantFlow=false` (standalone advisor)', () => {
    // Must match `showAdvisorCalculatorSurface(false, role)` — advisor surface
    // without client context.
    const all = ['upswitch_adaptive', 'dcf', 'ebitda_multiple', 'adjusted_nav', 'fiscal_4x']
    for (const role of ['accountant', 'expert', 'enterprise', 'admin']) {
      const showFullAdvisorList = showAdvisorCalculatorSurface(false, role)
      expect(filterPreSelectableMethodsForOwnerFounder(all, showFullAdvisorList)).toEqual(all)
    }
  })
  it('still restricts the nav for sellers/buyers even when the firm list is wide', () => {
    const all = ['upswitch_adaptive', 'dcf', 'ebitda_multiple', 'arr_multiple', 'startup_valuation']
    for (const role of ['seller', 'buyer']) {
      const showFullAdvisorList = showAdvisorCalculatorSurface(false, role)
      expect(filterPreSelectableMethodsForOwnerFounder(all, showFullAdvisorList)).toEqual([
        'upswitch_adaptive',
        'arr_multiple',
        'startup_valuation',
      ])
    }
  })
})
