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

export function isSafeMercuryNavigationUrlInput(
  targetUrl: string | null | undefined
): targetUrl is string {
  const raw = targetUrl?.trim()
  if (!raw || isLegacyReturnUrl(raw) || raw.startsWith('//')) return false

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw)
      const allowHttp =
        url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      return (
        (url.protocol === 'https:' || allowHttp) &&
        isTrustedUpswitchHostname(url.hostname) &&
        !isLegacyReturnUrl(url.pathname)
      )
    } catch {
      return false
    }
  }

  return raw.startsWith('/')
}

function coerceSafeMercuryNavigationUrl(targetUrl: string | null | undefined): string | null {
  const raw = targetUrl?.trim()
  if (!isSafeMercuryNavigationUrlInput(raw)) return null
  const mercuryUrl = getMercuryUrl().replace(/\/$/, '')

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const url = new URL(raw)
    const allowHttp =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (url.protocol === 'http:' && !allowHttp) {
      url.protocol = 'https:'
    }
    return url.toString()
  }

  return `${mercuryUrl}${raw.startsWith('/') ? raw : `/${raw}`}`
}

export function getSafeMercuryNavigationUrl(
  targetUrl: string | null | undefined,
  fallbackUrl?: string
): string {
  const mercuryUrl = getMercuryUrl().replace(/\/$/, '')
  const fallback =
    coerceSafeMercuryNavigationUrl(fallbackUrl) ?? `${mercuryUrl}/en/advisor/dashboard`
  return coerceSafeMercuryNavigationUrl(targetUrl) ?? fallback
}

export function navigateToSafeMercuryNavigationUrl(
  targetUrl: string | null | undefined,
  fallbackUrl?: string
): void {
  if (typeof window === 'undefined') return
  window.location.assign(getSafeMercuryNavigationUrl(targetUrl, fallbackUrl))
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
/** Seeds Mercury cold-nav dossier shell with a known company name after Venus exit. */
export const MERCURY_NEW_CLIENT_NAME_QUERY_KEY = 'newClientName'
/** Lets Mercury target the saved report when reconciling after `?from=valuation`. */
export const MERCURY_REPORT_ID_QUERY_KEY = 'reportId'

/**
 * Pathnames that should carry the celebration marker on a successful return.
 *
 * - `/advisor/clients/<id>` and the legacy `/accountant/clients/<id>` are
 *   the per-client detail surfaces an accountant returns to after running a
 *   valuation for one specific client. We mark these so Mercury can show
 *   the "added to client card" celebration.
 *
 * - `/business/dashboard` is the self-managed seller (PLG) dashboard — the
 *   ONLY destination the seller flow ever returns to. Marking it lets the
 *   Mercury seller dashboard invalidate its `client/context` query and
 *   surface a "valuation added to your business card" celebration without
 *   waiting for the 60-second `staleTime` to elapse.
 *
 * Generic accountant `dashboard` fallbacks are intentionally NOT marked —
 * they are reached when no specific client context exists, so a celebration
 * would be confusing.
 */
function shouldCarryCelebrationMarker(pathname: string): boolean {
  if (pathname.includes('/advisor/clients/')) return true
  if (pathname.includes('/accountant/clients/')) return true
  // Match `/<locale>/business/dashboard` and any sub-route the seller
  // dashboard might mount in the future. The locale-prefix is left as-is
  // because `getSafeMercuryReturnUrl` always re-stamps the path with the
  // explicit locale before this helper runs.
  if (/\/(?:en|nl)\/business\/dashboard(?:\/|$)/.test(pathname)) return true
  return false
}

/**
 * Values of the `from=` query parameter that this app owns. Only these are
 * ever overwritten or stripped — any other `from=` value (e.g. campaign
 * attribution like `from=email_campaign`, `from=newsletter`) is left
 * untouched so a Venus round-trip never silently drops the seller's
 * marketing context. The historical codename `venus` stays in the list as
 * the legacy alias Mercury still accepts on read.
 */
const MERCURY_OWNED_CELEBRATION_VALUES = new Set<string>([
  MERCURY_CELEBRATION_QUERY_VALUE,
  MERCURY_CELEBRATION_QUERY_VALUE_LEGACY,
])

function isMercuryOwnedCelebrationValue(value: string | null): boolean {
  if (value === null) return false
  return MERCURY_OWNED_CELEBRATION_VALUES.has(value)
}

export function applyMercuryCelebrationQuery(urlString: string, celebrate: boolean): string {
  try {
    const u = new URL(urlString)
    const existingFrom = u.searchParams.get(MERCURY_CELEBRATION_QUERY_KEY)
    if (celebrate) {
      if (shouldCarryCelebrationMarker(u.pathname)) {
        // Only overwrite when the existing `from=` is unset OR is one of
        // OUR celebration values. Foreign values (`from=email_campaign`)
        // are preserved so a round-trip through Venus does not erase the
        // seller's original campaign attribution.
        if (existingFrom === null || isMercuryOwnedCelebrationValue(existingFrom)) {
          u.searchParams.set(MERCURY_CELEBRATION_QUERY_KEY, MERCURY_CELEBRATION_QUERY_VALUE)
        }
      }
    } else {
      // Only strip when the existing value is OURS; leaving foreign
      // `from=` values intact preserves analytics / campaign context for
      // plain (non-celebration) exits too.
      if (isMercuryOwnedCelebrationValue(existingFrom)) {
        u.searchParams.delete(MERCURY_CELEBRATION_QUERY_KEY)
      }
    }
    return u.toString()
  } catch {
    return urlString
  }
}

export function applyMercuryNewClientNameQuery(
  urlString: string,
  companyName: string | null | undefined
): string {
  const trimmed = companyName?.trim()
  if (!trimmed) return urlString
  try {
    const u = new URL(urlString)
    if (!u.pathname.includes('/advisor/clients/') && !u.pathname.includes('/accountant/clients/')) {
      return urlString
    }
    u.searchParams.set(MERCURY_NEW_CLIENT_NAME_QUERY_KEY, trimmed)
    return u.toString()
  } catch {
    return urlString
  }
}

export function applyMercuryReportIdQuery(
  urlString: string,
  reportId: string | null | undefined
): string {
  const trimmed = reportId?.trim()
  if (!trimmed) return urlString
  try {
    const u = new URL(urlString)
    if (!u.pathname.includes('/advisor/clients/') && !u.pathname.includes('/accountant/clients/')) {
      return urlString
    }
    u.searchParams.set(MERCURY_REPORT_ID_QUERY_KEY, trimmed)
    return u.toString()
  } catch {
    return urlString
  }
}

type AppLocale = 'en' | 'nl' | 'fr'

/** Mercury routes use supported app locales as the first path segment. */
function mercuryPathLocale(locale: string): AppLocale {
  return locale === 'nl' || locale === 'fr' ? locale : 'en'
}

/** Strip app locale prefix (first segment only). Mirrors Mercury auth-return-url helper. */
function stripLocalePrefixFromPathname(pathname: string): string {
  const p = pathname.replace(/^\/(en|nl|fr)(\/|$)/, '/') || '/'
  return p === '//' ? '/' : p
}

function pathnameWithLocale(pathname: string, locale: AppLocale): string {
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
 *
 * `client_dashboard` is included because Mercury's `StartupValuationTile`
 * passes `source='client_dashboard'` (it's mounted on the seller dashboard
 * at `/business/dashboard`). Without this token the StartupValuationTile's
 * exit fallback would route to `/advisor/dashboard` whenever sessionStorage
 * dropped the explicit `return_url` — a wrong-persona 404 for sellers.
 *
 * The `mercury_seller_*` and `*orphaned_seller*` entries are redundant with
 * the broader `seller` token but are kept explicit so a future audit can
 * see at a glance which seller surfaces hand off to Venus today.
 */
const SELLER_SOURCE_TOKENS = [
  'business_',
  'seller',
  'owner',
  'startup',
  'for_owner',
  'mercury_seller',
  'orphaned_seller',
  'client_dashboard',
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
  pathLocale: AppLocale,
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
    options?.locale && ['en', 'nl', 'fr'].includes(options.locale) ? options.locale : undefined
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
