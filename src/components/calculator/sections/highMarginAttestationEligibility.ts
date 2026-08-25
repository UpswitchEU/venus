export function canOfferSourceBoundHighMarginAttestation(input: {
  requiresReview: boolean
  sourceProvider?: string | null
  sourceDigest?: string | null
  titanSupportsAttestation?: boolean
}): boolean {
  return (
    input.requiresReview &&
    input.sourceProvider?.toLowerCase() === 'silverfin' &&
    typeof input.sourceDigest === 'string' &&
    input.sourceDigest.length > 0 &&
    input.titanSupportsAttestation === true
  )
}
