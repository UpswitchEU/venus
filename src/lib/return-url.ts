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
 * Set or strip `from=venus` on a Mercury URL. Only set when returning after a completed
 * valuation so Mercury can show "added to business card" — never for a plain exit.
 */
/** Only client detail (or sub-routes) should carry `from=venus` — not dashboard fallbacks. */
function isAccountantClientPath(pathname: string): boolean {
  return pathname.includes('/accountant/clients/')
}

export function applyMercuryCelebrationQuery(urlString: string, celebrate: boolean): string {
  try {
    const u = new URL(urlString)
    if (celebrate) {
      if (isAccountantClientPath(u.pathname)) {
        u.searchParams.set('from', 'venus')
      }
    } else {
      u.searchParams.delete('from')
    }
    return u.toString()
  } catch {
    return urlString
  }
}

/**
 * Returns a safe Mercury URL for redirect. If storedUrl is legacy or invalid,
 * falls back to dashboard or client valuations.
 *
 * @param celebrateMercuryReturn When true, appends `?from=venus` so Mercury can celebrate.
 *   When false/undefined, strips `from` if present (defensive cleanup of old links).
 */
export function getSafeMercuryReturnUrl(
  storedUrl: string | null,
  options?: {
    clientContextId?: string
    locale?: string
    sourceApp?: string
    celebrateMercuryReturn?: boolean
  }
): string {
  const mercuryUrl = getMercuryUrl()
  const validLocale =
    options?.locale && ['en', 'nl', 'fr', 'de'].includes(options.locale) ? options.locale : 'en'
  const celebrate = options?.celebrateMercuryReturn === true

  let result: string

  if (storedUrl && !isLegacyReturnUrl(storedUrl)) {
    if (storedUrl.startsWith('http://') || storedUrl.startsWith('https://')) {
      try {
        const url = new URL(storedUrl)
        if (url.origin.includes('upswitch.app') && !isLegacyReturnUrl(url.pathname)) {
          result = storedUrl
        } else {
          result = `${mercuryUrl}/${validLocale}/accountant/dashboard`
        }
      } catch {
        result = `${mercuryUrl}/${validLocale}/accountant/dashboard`
      }
    } else {
      result = `${mercuryUrl}${storedUrl.startsWith('/') ? '' : '/'}${storedUrl}`
    }
  } else if (options?.clientContextId) {
    result = `${mercuryUrl}/${validLocale}/accountant/clients/${options.clientContextId}/valuations`
  } else if (options?.sourceApp?.includes('mercury')) {
    result = `${mercuryUrl}/${validLocale}/accountant/dashboard`
  } else {
    result = `${mercuryUrl}/${validLocale}/accountant/dashboard`
  }

  return applyMercuryCelebrationQuery(result, celebrate)
}
