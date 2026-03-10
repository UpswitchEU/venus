import { describe, expect, it } from 'vitest'
import { hasExistingValuationVersion, shouldOpenVersionConfirmation } from '../versionConfirmation'

describe('versionConfirmation', () => {
  describe('hasExistingValuationVersion', () => {
    it('returns false for a brand-new valuation', () => {
      expect(hasExistingValuationVersion(null)).toBe(false)
      expect(hasExistingValuationVersion({ versionNumber: 0 })).toBe(false)
    })

    it('returns true once a saved valuation version exists', () => {
      expect(hasExistingValuationVersion({ versionNumber: 1 })).toBe(true)
      expect(hasExistingValuationVersion({ versionNumber: 2 })).toBe(true)
    })
  })

  describe('shouldOpenVersionConfirmation', () => {
    it('does not open for a first valuation even if the form is dirty', () => {
      expect(
        shouldOpenVersionConfirmation({
          currentVersion: null,
          hasFormChanges: true,
          hasAnyNormalization: false,
          isConfirmationOpen: false,
        })
      ).toBe(false)
    })

    it('opens for an existing valuation with form changes', () => {
      expect(
        shouldOpenVersionConfirmation({
          currentVersion: { versionNumber: 1 },
          hasFormChanges: true,
          hasAnyNormalization: false,
          isConfirmationOpen: false,
        })
      ).toBe(true)
    })

    it('opens for an existing valuation with accepted normalizations', () => {
      expect(
        shouldOpenVersionConfirmation({
          currentVersion: { versionNumber: 1 },
          hasFormChanges: false,
          hasAnyNormalization: true,
          isConfirmationOpen: false,
        })
      ).toBe(true)
    })

    it('blocks duplicate modal launches while confirmation is already open', () => {
      expect(
        shouldOpenVersionConfirmation({
          currentVersion: { versionNumber: 3 },
          hasFormChanges: true,
          hasAnyNormalization: true,
          isConfirmationOpen: true,
        })
      ).toBe(false)
    })
  })
})
