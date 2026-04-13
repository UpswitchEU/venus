import { describe, expect, it } from 'vitest'
import {
  isAccountantFreeOrStarterTier,
  normalizeAccountantPlanTypeKey,
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
    expect(keys?.length).toBe(4)
  })
})
