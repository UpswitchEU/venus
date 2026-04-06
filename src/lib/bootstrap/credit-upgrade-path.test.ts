import { describe, expect, it } from 'vitest'
import {
  ACCOUNTANT_CREDIT_UPGRADE_PATH,
  CLIENT_CREDIT_UPGRADE_PATH,
  isAccountantBillingUpgradePath,
  isClientPremiumUpgradePath,
} from './credit-upgrade-path'

describe('isAccountantBillingUpgradePath', () => {
  it('returns true for current and legacy Titan tokens', () => {
    expect(isAccountantBillingUpgradePath(ACCOUNTANT_CREDIT_UPGRADE_PATH)).toBe(true)
    expect(isAccountantBillingUpgradePath('accountant_pro')).toBe(true)
  })

  it('returns false for client premium and empty', () => {
    expect(isAccountantBillingUpgradePath(CLIENT_CREDIT_UPGRADE_PATH)).toBe(false)
    expect(isAccountantBillingUpgradePath(undefined)).toBe(false)
    expect(isAccountantBillingUpgradePath('')).toBe(false)
  })
})

describe('isClientPremiumUpgradePath', () => {
  it('returns true only for client_premium token', () => {
    expect(isClientPremiumUpgradePath(CLIENT_CREDIT_UPGRADE_PATH)).toBe(true)
    expect(isClientPremiumUpgradePath(ACCOUNTANT_CREDIT_UPGRADE_PATH)).toBe(false)
    expect(isClientPremiumUpgradePath(undefined)).toBe(false)
  })
})
