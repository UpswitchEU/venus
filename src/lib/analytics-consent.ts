/**
 * Venus consent helper.
 *
 * Reads the cross-subdomain `upswitch_cookie_consent` cookie that Mercury
 * writes to `.upswitch.app`. We use the same cookie shape Mercury uses so
 * accepting consent on `upswitch.app` automatically grants analytics
 * consent on `valuation.upswitch.app` without a second banner.
 *
 * `isAnalyticsConsentGranted()` is the one gate every custom event goes
 * through. Without it, Venus emitted `venus_*` events even when the user
 * had explicitly denied analytics — a GDPR breach and a data-quality issue
 * (events from non-consented users skewed funnel rates).
 */

const COOKIE_CONSENT_KEY = 'upswitch_cookie_consent'

export interface CookiePreferences {
  analytics?: boolean
  functional?: boolean
}

export function getCookiePreferences(): CookiePreferences | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_CONSENT_KEY}=`))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch {
    return null
  }
}

export function isAnalyticsConsentGranted(): boolean {
  return getCookiePreferences()?.analytics === true
}
