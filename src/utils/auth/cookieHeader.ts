export const TITAN_ACCESS_COOKIE = 'upswitch_access_token'
export const TITAN_REFRESH_COOKIE = 'upswitch_refresh_token'

export function getCookieValueFromHeader(cookieHeader: string, cookieName: string): string | null {
  if (!cookieHeader || !cookieName) return null

  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue

    const name = trimmed.slice(0, eq).trim()
    if (name !== cookieName) continue

    return trimmed.slice(eq + 1).trim()
  }

  return null
}

export function hasCookieInHeader(cookieHeader: string, cookieName: string): boolean {
  return getCookieValueFromHeader(cookieHeader, cookieName) !== null
}

export function getTitanAccessTokenFromCookieHeader(cookieHeader: string): string | null {
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
