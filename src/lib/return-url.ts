/**
 * Return URL utilities for Mercury integration.
 * Prevents redirecting to legacy routes that no longer exist (e.g. accountant_listings).
 */

import { getMercuryUrl } from '@/utils/getMercuryUrl'

/** Route patterns that no longer exist in Mercury and would 404 */
export const LEGACY_ROUTE_PATTERNS = ['_listings', 'accountant_listings', 'seller_listings']

/**
 * Returns true if the URL contains a legacy route pattern.
 */
export function isLegacyReturnUrl(url: string): boolean {
  return LEGACY_ROUTE_PATTERNS.some((pattern) => url.includes(pattern))
}

/**
 * Returns a safe Mercury URL for redirect. If storedUrl is legacy or invalid,
 * falls back to dashboard or client valuations.
 */
export function getSafeMercuryReturnUrl(
  storedUrl: string | null,
  options?: {
    clientContextId?: string
    locale?: string
    sourceApp?: string
  }
): string {
  const mercuryUrl = getMercuryUrl()
  const validLocale =
    options?.locale && ['en', 'nl', 'fr', 'de'].includes(options.locale) ? options.locale : 'en'

  if (storedUrl && !isLegacyReturnUrl(storedUrl)) {
    if (storedUrl.startsWith('http://') || storedUrl.startsWith('https://')) {
      try {
        const url = new URL(storedUrl)
        if (url.origin.includes('upswitch.app') && !isLegacyReturnUrl(url.pathname)) {
          return storedUrl
        }
      } catch {
        // Invalid URL, fall through
      }
    } else {
      return `${mercuryUrl}${storedUrl.startsWith('/') ? '' : '/'}${storedUrl}`
    }
  }

  // Fallback: client valuations or dashboard
  if (options?.clientContextId) {
    return `${mercuryUrl}/${validLocale}/accountant/clients/${options.clientContextId}/valuations`
  }
  if (options?.sourceApp?.includes('mercury')) {
    return `${mercuryUrl}/${validLocale}/accountant/dashboard`
  }
  return `${mercuryUrl}/${validLocale}/accountant/dashboard`
}
