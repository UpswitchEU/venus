import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getCookiePreferences, isAnalyticsConsentGranted } from '../analytics-consent'

const COOKIE_KEY = 'upswitch_cookie_consent'

function setConsentCookie(value: object | string | null): void {
  // Clear any existing consent cookie first
  document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  if (value === null) return
  const raw = typeof value === 'string' ? value : encodeURIComponent(JSON.stringify(value))
  document.cookie = `${COOKIE_KEY}=${raw}; path=/`
}

describe('Venus analytics-consent', () => {
  beforeEach(() => {
    setConsentCookie(null)
  })
  afterEach(() => {
    setConsentCookie(null)
  })

  it('returns null when no consent cookie is set', () => {
    expect(getCookiePreferences()).toBeNull()
    expect(isAnalyticsConsentGranted()).toBe(false)
  })

  it('returns the parsed preferences when the cookie is valid JSON', () => {
    setConsentCookie({ analytics: true, functional: true })

    expect(getCookiePreferences()).toEqual({ analytics: true, functional: true })
    expect(isAnalyticsConsentGranted()).toBe(true)
  })

  it('reports analytics as denied when only functional is enabled', () => {
    setConsentCookie({ analytics: false, functional: true })

    expect(isAnalyticsConsentGranted()).toBe(false)
  })

  it('returns null and denies consent when the cookie is malformed', () => {
    setConsentCookie('not-json')

    expect(getCookiePreferences()).toBeNull()
    expect(isAnalyticsConsentGranted()).toBe(false)
  })

  it('treats missing analytics flag as denied (default-deny)', () => {
    setConsentCookie({ functional: true })

    expect(isAnalyticsConsentGranted()).toBe(false)
  })
})
