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

  it('rejects valuation-like attacker hosts instead of deriving a parent domain', () => {
    expect(
      deriveMercuryOriginFromTrustedVenusHostname('valuation.evil-phishing.example')
    ).toBeNull()
    expect(
      deriveMercuryOriginFromTrustedVenusHostname('preview.valuation.evil-phishing.example')
    ).toBeNull()
  })
})
