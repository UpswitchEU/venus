import { hasConflictingAuthCookies, readAllCookieValues } from '../authCookieScope'

export const TITAN_ACCESS_COOKIE = 'upswitch_access_token'
export const TITAN_REFRESH_COOKIE = 'upswitch_refresh_token'

export function getCookieValueFromHeader(cookieHeader: string, cookieName: string): string | null {
  if (!cookieHeader || !cookieName) return null
  // One implementation of "which cookie is the cookie", shared with Titan and
  // Mercury. A second, hand-rolled one is how the identities diverged.
  return readAllCookieValues(cookieHeader, cookieName)[0] ?? null
}

export function hasCookieInHeader(cookieHeader: string, cookieName: string): boolean {
  return getCookieValueFromHeader(cookieHeader, cookieName) !== null
}

/**
 * The access token for `Authorization: Bearer …`, or null when the jar is
 * ambiguous.
 *
 * Six Venus routes turn this into a Bearer header, and **a Bearer token is
 * invisible to Titan's duplicate-cookie guard** — that guard reads the
 * `Cookie` header, which these proxies do not always forward. Resolving the
 * ambiguity here would smuggle one identity past every check in the stack.
 *
 * Returning the first match is also the wrong guess specifically: RFC 6265
 * §5.4 sends the OLDEST cookie first, so "first" is the stale identity
 * whenever a previous user's cookie survives in a foreign scope. That is the
 * 2026-09-19 cross-account bleed.
 */
export function getTitanAccessTokenFromCookieHeader(cookieHeader: string): string | null {
  if (hasConflictingAuthCookies(cookieHeader)) {
    console.error('[venus] conflicting auth cookies — withholding bearer token')
    return null
  }
  const token = getCookieValueFromHeader(cookieHeader, TITAN_ACCESS_COOKIE)
  return token?.trim() || null
}

export function hasTitanAccessCookie(cookieHeader: string): boolean {
  return hasCookieInHeader(cookieHeader, TITAN_ACCESS_COOKIE)
}

export function hasTitanRefreshCookie(cookieHeader: string): boolean {
  return hasCookieInHeader(cookieHeader, TITAN_REFRESH_COOKIE)
}

export function hasTitanAuthCookie(cookieHeader: string): boolean {
  return hasTitanAccessCookie(cookieHeader) || hasTitanRefreshCookie(cookieHeader)
}
