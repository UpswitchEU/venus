import { describe, expect, it } from 'vitest'
import {
  filterPreSelectableMethodsForOwnerFounder,
  isAccountantFreeOrStarterTier,
  isAccountantTierRole,
  normalizeAccountantPlanTypeKey,
  OWNER_FOUNDER_METHOD_KEYS,
  resolveAllowedMethodKeys,
  showAdvisorCalculatorSurface,
} from './accountantPlanMethods'

describe('normalizeAccountantPlanTypeKey', () => {
  it('treats empty and undefined as free', () => {
    expect(normalizeAccountantPlanTypeKey(undefined)).toBe('free')
    expect(normalizeAccountantPlanTypeKey('')).toBe('free')
  })
  it('trims and lowercases', () => {
    expect(normalizeAccountantPlanTypeKey('  Pro  ')).toBe('pro')
  })
})

describe('isAccountantFreeOrStarterTier', () => {
  it('is true for free and starter', () => {
    expect(isAccountantFreeOrStarterTier('free')).toBe(true)
    expect(isAccountantFreeOrStarterTier('starter')).toBe(true)
    expect(isAccountantFreeOrStarterTier('STARTER')).toBe(true)
  })
  it('is false for pro and other paid tiers', () => {
    expect(isAccountantFreeOrStarterTier('pro')).toBe(false)
    expect(isAccountantFreeOrStarterTier('premium')).toBe(false)
  })
})

describe('resolveAllowedMethodKeys', () => {
  it('returns free allowlist when API omits allowed_methods for free', () => {
    const keys = resolveAllowedMethodKeys(undefined, 'free')
    expect(keys).toContain('dcf')
    expect(keys).toContain('upswitch_adaptive')
    expect(keys).toContain('arr_multiple')
    expect(keys).toContain('startup_valuation')
    expect(keys?.length).toBe(6)
  })

  // Cross-app contract: paid tiers must always resolve to `null`
  // (= "all methods allowed"). Returning a restricted allowlist for any of
  // these would silently lock down paid-tier UI before the next deploy of
  // Titan's `/credits/plan` ships an explicit `allowed_methods` array. Pin
  // every plan literal that Mercury knows about so a typo in either app
  // surfaces here rather than on a customer screen.
  it.each(['starter', 'pro', 'expert', 'enterprise', 'premium'])(
    'returns null (all methods) for paid tier %s when API omits allowed_methods',
    (planType) => {
      expect(resolveAllowedMethodKeys(undefined, planType)).toBeNull()
    }
  )

  it('respects an explicit allowlist from the API even on paid tiers', () => {
    const explicit = ['upswitch_adaptive', 'dcf']
    expect(resolveAllowedMethodKeys(explicit, 'pro')).toEqual(explicit)
    // null = explicit "no restriction" from API; preserve as null
    expect(resolveAllowedMethodKeys(null, 'pro')).toBeNull()
  })

  it('falls back to the free allowlist for unknown plan strings (defense in depth)', () => {
    // Defends against a future Titan tier landing before Venus picks it up:
    // an unrecognised string MUST collapse to the most restrictive list so
    // we never accidentally unlock paid methods in the UI.
    const keys = resolveAllowedMethodKeys(undefined, 'mystery_tier')
    expect(keys?.length).toBe(6)
    expect(keys).toContain('dcf')
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

describe('isAccountantTierRole', () => {
  // Mirrors Mercury `ACCOUNTANT_TIER_ROLES` + admin (cross-app contract).
  // Bug history: Venus previously gated the full advisor method nav purely
  // on `isAccountantFlow` (= `identity.type === 'accountant_for_client'`),
  // so an `accountant`/`expert`/`enterprise` user opening the standalone
  // `/calculator` (no client context) was demoted to the 3-method founder
  // nav. These tests pin the role contract that fixes the regression.
  it.each(['accountant', 'expert', 'enterprise', 'admin'])(
    'recognises advisor-tier role %s',
    (role) => {
      expect(isAccountantTierRole(role)).toBe(true)
    }
  )
  it.each(['seller', 'buyer', 'guest', '', null, undefined])(
    'rejects non-advisor input %s',
    (role) => {
      expect(isAccountantTierRole(role as string | null | undefined)).toBe(false)
    }
  )
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
