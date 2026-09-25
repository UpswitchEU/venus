import { describe, expect, it } from 'vitest'
import { deriveMercuryOriginFromTrustedVenusHostname } from './getMercuryUrl'

describe('deriveMercuryOriginFromTrustedVenusHostname', () => {
  it('maps exact trusted Venus hosts to Mercury origins', () => {
    expect(deriveMercuryOriginFromTrustedVenusHostname('valuation.upswitch.app')).toBe(
      'https://www.upswitch.app'
    )
    expect(deriveMercuryOriginFromTrustedVenusHostname('preview.valuation.upswitch.app')).toBe(
      'https://preview.upswitch.app'
    )
    expect(deriveMercuryOriginFromTrustedVenusHostname('staging.valuation.upswitch.app')).toBe(
      'https://staging.upswitch.app'
    )
  })

  // The domain is not renewed: Venus served there must not point anyone at it. Callers
  // fall back to the .app Mercury origin.
  it('derives no Mercury origin on the retired upswitch.biz domain', () => {
    expect(deriveMercuryOriginFromTrustedVenusHostname('valuation.upswitch.biz')).toBeNull()
  })

  it('rejects valuation-like attacker hosts instead of deriving a parent domain', () => {
    expect(
      deriveMercuryOriginFromTrustedVenusHostname('valuation.evil-phishing.example')
    ).toBeNull()
    expect(
      deriveMercuryOriginFromTrustedVenusHostname('preview.valuation.evil-phishing.example')
    ).toBeNull()
  })
})
