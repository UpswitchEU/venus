import { describe, expect, it } from 'vitest'
import { isOwnerRole, ownerNextTier, ownerUpgradeCopy } from './OwnerUpgradeCta'

describe('OwnerUpgradeCta logic', () => {
  describe('isOwnerRole', () => {
    it('treats the seller role as a business owner', () => {
      expect(isOwnerRole('seller')).toBe(true)
      expect(isOwnerRole(' Seller ')).toBe(true)
    })
    it('treats advisors / missing roles as non-owner', () => {
      expect(isOwnerRole('accountant')).toBe(false)
      expect(isOwnerRole(null)).toBe(false)
      expect(isOwnerRole(undefined)).toBe(false)
    })
  })

  describe('ownerNextTier', () => {
    it('upsells Grow from free/Know (incl. unset)', () => {
      expect(ownerNextTier('free')).toBe('grow')
      expect(ownerNextTier('')).toBe('grow')
      expect(ownerNextTier(undefined)).toBe('grow')
      expect(ownerNextTier('FREE')).toBe('grow')
    })
    it('upsells Sell from Grow', () => {
      expect(ownerNextTier('owner_grow')).toBe('sell')
    })
    it('upsells nothing from the top tier or legacy premium', () => {
      expect(ownerNextTier('owner_sell')).toBeNull()
      expect(ownerNextTier('premium')).toBeNull()
    })
  })

  describe('ownerUpgradeCopy', () => {
    it('localizes the Grow headline (en/nl/fr)', () => {
      expect(ownerUpgradeCopy('grow', 'en').headline).toBe('Make your number go up')
      expect(ownerUpgradeCopy('grow', 'nl').headline).toBe('Laat uw waarde stijgen')
      expect(ownerUpgradeCopy('grow', 'fr').headline).toBe('Faites grimper votre valeur')
    })
    it('puts the right price in each tier CTA', () => {
      expect(ownerUpgradeCopy('grow', 'en').cta).toContain('149')
      expect(ownerUpgradeCopy('sell', 'en').cta).toContain('299')
      expect(ownerUpgradeCopy('sell', 'nl').cta).toContain('299')
    })
  })
})
