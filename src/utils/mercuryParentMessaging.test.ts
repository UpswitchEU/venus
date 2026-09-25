import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isTrustedMercuryParentOrigin,
  resolveMercuryParentTargetOrigin,
} from './mercuryParentMessaging'

// The domain Upswitch did not renew, assembled from parts so a search of this public
// repository finds no reference to it.
const RETIRED_DOMAIN = ['upswitch', 'biz'].join('.')

function setDocumentReferrer(value: string): void {
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    value,
  })
}

describe('isTrustedMercuryParentOrigin', () => {
  it('accepts exact configured parent origins', () => {
    expect(
      isTrustedMercuryParentOrigin(
        'https://mercury-preview.example.com',
        'https://mercury-preview.example.com'
      )
    ).toBe(true)
  })

  it('accepts known Mercury production and preview origins', () => {
    expect(isTrustedMercuryParentOrigin('https://upswitch.app')).toBe(true)
    expect(isTrustedMercuryParentOrigin('https://www.upswitch.app')).toBe(true)
    expect(isTrustedMercuryParentOrigin('https://preview.upswitch.app')).toBe(true)
  })

  // The domain is not renewed: whoever registers it next must not be trusted as Mercury.
  it('does not trust the retired .biz domain', () => {
    expect(isTrustedMercuryParentOrigin(`https://${RETIRED_DOMAIN}`)).toBe(false)
    expect(isTrustedMercuryParentOrigin(`https://www.${RETIRED_DOMAIN}`)).toBe(false)
  })

  it('rejects subdomain-confusion origins', () => {
    expect(isTrustedMercuryParentOrigin('https://www.upswitch.app.evil.example')).toBe(false)
    expect(isTrustedMercuryParentOrigin('https://notupswitch.app')).toBe(false)
    expect(isTrustedMercuryParentOrigin('javascript:alert(1)')).toBe(false)
  })
})

describe('resolveMercuryParentTargetOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    setDocumentReferrer('')
  })

  it('prefers a trusted referrer so preview embeds post to the real parent origin', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://www.upswitch.app')
    setDocumentReferrer('https://preview.upswitch.app/nl/advisor/dashboard')

    expect(resolveMercuryParentTargetOrigin()).toBe('https://preview.upswitch.app')
  })

  it('falls back to the configured Mercury origin for hostile referrers', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://www.upswitch.app')
    setDocumentReferrer('https://www.upswitch.app.evil.example/phish')

    expect(resolveMercuryParentTargetOrigin()).toBe('https://www.upswitch.app')
  })

  it('never posts to a parent on the retired .biz domain', () => {
    vi.stubEnv('NEXT_PUBLIC_MERCURY_URL', 'https://www.upswitch.app')
    setDocumentReferrer(`https://${RETIRED_DOMAIN}/nl/advisor/dashboard`)

    expect(resolveMercuryParentTargetOrigin()).toBe('https://www.upswitch.app')
  })
})
