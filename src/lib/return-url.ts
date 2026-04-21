/**
 * Return URL utilities for Mercury integration.
 * Prevents redirecting to legacy routes that no longer exist (e.g. accountant_listings).
 */

import { getMercuryUrl } from '@/utils/getMercuryUrl'

/**
 * True only for real Upswitch/Venus hosts.
 * Never use `origin.includes('upswitch.app')` — that matches typosquats like `notupswitch.app`.
 */
export function isTrustedUpswitchHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return true
  if (h === 'upswitch.app' || h.endsWith('.upswitch.app')) return true
  return false
}

/** Route patterns that no longer exist in Mercury and would 404 */
export const LEGACY_ROUTE_PATTERNS = ['_listings', 'accountant_listings', 'seller_listings']

/**
 * Returns true if the URL contains a legacy route pattern.
 */
export function isLegacyReturnUrl(url: string): boolean {
  return LEGACY_ROUTE_PATTERNS.some((pattern) => url.includes(pattern))
}

/**
 * Whether a raw Mercury return_url value is safe to persist/read.
 * Treat stored session values as untrusted until they pass this check.
 */
export function isSafeMercuryReturnUrlInput(
  storedUrl: string | null | undefined
): storedUrl is string {
  const raw = storedUrl?.trim()
  if (!raw || isLegacyReturnUrl(raw)) return false

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw)
      return isTrustedUpswitchHostname(url.hostname) && !isLegacyReturnUrl(url.pathname)
    } catch {
      return false
    }
  }

  return !raw.startsWith('//')
}

/**
 * Set or strip the celebration marker on a Mercury return URL. Only set when
 * returning after a completed valuation so Mercury can show "added to business
 * card" — never for a plain exit.
 *
 * The marker is the user-visible neutral value `from=valuation` (was previously
 * the internal codename `from=venus`, kept as a legacy alias on the Mercury
 * reader for in-flight URLs but never re-emitted).
 */
export const MERCURY_CELEBRATION_QUERY_KEY = 'from'
export const MERCURY_CELEBRATION_QUERY_VALUE = 'valuation'
/** Legacy value emitted before the codename strip — Mercury still accepts it on read. */
export const MERCURY_CELEBRATION_QUERY_VALUE_LEGACY = 'venus'

/** Only client detail (or sub-routes) should carry the celebration marker — not dashboard fallbacks. */
function isAccountantClientPath(pathname: string): boolean {
  return (
    pathname.includes('/advisor/clients/') ||
    pathname.includes('/accountant/clients/')
  )
}

export function applyMercuryCelebrationQuery(urlString: string, celebrate: boolean): string {
  try {
    const u = new URL(urlString)
    if (celebrate) {
      if (isAccountantClientPath(u.pathname)) {
        u.searchParams.set(
          MERCURY_CELEBRATION_QUERY_KEY,
          MERCURY_CELEBRATION_QUERY_VALUE
        )
      }
    } else {
      u.searchParams.delete(MERCURY_CELEBRATION_QUERY_KEY)
    }
    return u.toString()
  } catch {
    return urlString
  }
}

/** Mercury routes only use en|nl as the first path segment. */
function mercuryPathLocale(locale: string): 'en' | 'nl' {
  return locale === 'nl' ? 'nl' : 'en'
}

/** Strip /en or /nl prefix (first segment only). Mirrors Mercury auth-return-url helper. */
function stripLocalePrefixFromPathname(pathname: string): string {
  const p = pathname.replace(/^\/(en|nl)(\/|$)/, '/') || '/'
  return p === '//' ? '/' : p
}

function pathnameWithLocale(pathname: string, locale: 'en' | 'nl'): string {
  const rest = stripLocalePrefixFromPathname(pathname)
  return rest === '/' ? `/${locale}` : `/${locale}${rest}`
}

/**
 * Tokens in the cross-app `source` query value that mark a flow as
 * originating from the business owner / seller side of Mercury rather than
 * the accountant workspace. Kept separate from `ACCOUNTANT_SOURCE_TOKENS`
 * so we can default to the safer "owner" experience (the dashboard owners
 * can always reach) when the signal is ambiguous and an explicit
 * `return_url` is missing.
 */
const SELLER_SOURCE_TOKENS = [
  'business_',
  'seller',
  'owner',
  'startup',
  'for_owners',
  'mercury_seller',
  'orphaned_seller',
] as const

const ACCOUNTANT_SOURCE_TOKENS = ['accountant', 'advisor'] as const

/**
 * Pick the right Mercury dashboard fallback when no explicit `return_url`
 * was stored. Sellers must never land on `/advisor/dashboard` (404 / wrong
 * persona) and accountants must never land on `/business/dashboard`.
 *
 * The match is case-insensitive and uses substring tokens so future
 * `source` values that follow the same naming convention are routed
 * automatically without code changes.
 */
export function fallbackDashboardForSource(
  sourceApp: string | null | undefined,
  pathLocale: 'en' | 'nl',
  mercuryUrl: string
): string {
  const base = mercuryUrl.replace(/\/$/, '')
  const source = sourceApp?.toLowerCase().trim() ?? ''
  if (source && ACCOUNTANT_SOURCE_TOKENS.some((token) => source.includes(token))) {
    return `${base}/${pathLocale}/advisor/dashboard`
  }
  if (source && SELLER_SOURCE_TOKENS.some((token) => source.includes(token))) {
    return `${base}/${pathLocale}/business/dashboard`
  }
  // Ambiguous (`source=mercury` or empty): keep the historical advisor
  // default to avoid silently changing destinations for accountant flows
  // that never paired the cross-app handoff with a more specific source.
  return `${base}/${pathLocale}/advisor/dashboard`
}

/**
 * Returns a safe Mercury URL for redirect. If storedUrl is legacy or invalid,
 * falls back to dashboard or client valuations.
 *
 * @param celebrateMercuryReturn When true, appends `?from=valuation` so Mercury can celebrate.
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
  /** When set, stored Mercury paths are rewritten to this locale; when omitted, stored URLs are kept as-is. */
  const explicitLocaleOpt =
    options?.locale && ['en', 'nl', 'fr', 'de'].includes(options.locale) ? options.locale : undefined
  const pathLocale = mercuryPathLocale(explicitLocaleOpt ?? 'en')
  const celebrate = options?.celebrateMercuryReturn === true

  let result: string

  const sourceFallback = fallbackDashboardForSource(options?.sourceApp, pathLocale, mercuryUrl)

  const raw = storedUrl?.trim()
  if (isSafeMercuryReturnUrlInput(raw)) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const url = new URL(raw)
        if (!isTrustedUpswitchHostname(url.hostname) || isLegacyReturnUrl(url.pathname)) {
          result = sourceFallback
        } else {
          const allowHttp =
            url.protocol === 'http:' &&
            (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
          if (url.protocol === 'http:' && !allowHttp) {
            url.protocol = 'https:'
          }
          if (explicitLocaleOpt !== undefined) {
            url.pathname = pathnameWithLocale(url.pathname, mercuryPathLocale(explicitLocaleOpt))
          }
          result = url.toString()
        }
      } catch {
        result = sourceFallback
      }
    } else if (raw.startsWith('//')) {
      // Protocol-relative "URLs" must not be concatenated onto a base (open-redirect footgun).
      result = sourceFallback
    } else {
      if (explicitLocaleOpt !== undefined) {
        const rel = raw.startsWith('/') ? raw : `/${raw}`
        const withLoc = pathnameWithLocale(rel, mercuryPathLocale(explicitLocaleOpt))
        result = `${mercuryUrl.replace(/\/$/, '')}${withLoc}`
      } else {
        result = `${mercuryUrl}${raw.startsWith('/') ? '' : '/'}${raw}`
      }
    }
  } else if (options?.clientContextId) {
    result = `${mercuryUrl}/${pathLocale}/advisor/clients/${options.clientContextId}/valuations`
  } else {
    result = sourceFallback
  }

  return applyMercuryCelebrationQuery(result, celebrate)
}
