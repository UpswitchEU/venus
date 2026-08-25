import { describe, expect, it } from 'vitest'
import { canOfferSourceBoundHighMarginAttestation } from './highMarginAttestationEligibility'

describe('canOfferSourceBoundHighMarginAttestation', () => {
  const completeEvidence = {
    requiresReview: true,
    sourceProvider: 'silverfin',
    sourceDigest: 'a'.repeat(64),
    titanSupportsAttestation: true,
  }

  it('offers attestation only when Titan explicitly admits complete Silverfin evidence', () => {
    expect(canOfferSourceBoundHighMarginAttestation(completeEvidence)).toBe(true)
  })

  it.each([
    { ...completeEvidence, titanSupportsAttestation: undefined },
    { ...completeEvidence, titanSupportsAttestation: false },
    { ...completeEvidence, sourceDigest: null },
    { ...completeEvidence, sourceProvider: 'exact' },
    { ...completeEvidence, requiresReview: false },
  ])('fails closed for incomplete or unapproved evidence %#', (input) => {
    expect(canOfferSourceBoundHighMarginAttestation(input)).toBe(false)
  })
})
