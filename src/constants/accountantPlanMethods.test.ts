import { describe, expect, it } from 'vitest'
import {
  filterPreSelectableMethodsForOwnerFounder,
  isAccountantFreeOrStarterTier,
  normalizeAccountantPlanTypeKey,
  OWNER_FOUNDER_METHOD_KEYS,
  resolveAllowedMethodKeys,
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
