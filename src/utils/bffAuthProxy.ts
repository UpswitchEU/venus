/**
 * BFF → Titan auth proxy helpers (Venus).
 * Mirrors Mercury `route-helpers` cookie merge so partial `Cookie` headers still forward HttpOnly pairs from `cookies()`.
 */

import { cookies } from 'next/headers'

/**
 * Thrown when `fetchWithTimeout` aborts. Message matches Mercury for shared client handling.
 */
export class AuthUpstreamTimeoutError extends Error {
  readonly code = 'upstream_timeout' as const

  constructor(public readonly targetHost: string) {
    super('Request timeout - please try again')
    this.name = 'AuthUpstreamTimeoutError'
  }
}

/** Default BFF→Titan timeout (most routes). */
export const AUTH_FETCH_TIMEOUT_MS = 10_000

/**
 * Each BFF→Titan hop for `/api/auth/me` (refresh and/or `GET /me`). Keep **below** client
 * `CLIENT_AUTH_ME_FETCH_TIMEOUT_MS` in `auth-fetch-timeout.ts` — the handler may chain **two** hops.
 */
export const AUTH_FETCH_TIMEOUT_AUTH_ME_MS = 9_000

export function mergeCookieHeaderFromSetCookieHeaders(
  existingCookieHeader: string,
  setCookieHeaders: string[]
): string {
  const map = new Map<string, string>()
  for (const part of existingCookieHeader.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (name) map.set(name, value)
  }
  for (const sc of setCookieHeaders) {
    const first = sc.split(';')[0]?.trim()
    if (!first) continue
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (name) map.set(name, value)
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export function buildBffCookieHeader(
  requestCookieHeader: string,
  cookieStoreHeader: string
): string {
  let cookieHeader = requestCookieHeader || cookieStoreHeader
  if (requestCookieHeader && cookieStoreHeader) {
    const storeSegments = cookieStoreHeader
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p.includes('='))
    if (storeSegments.length > 0) {
      cookieHeader = mergeCookieHeaderFromSetCookieHeaders(requestCookieHeader, storeSegments)
    }
  }
  return cookieHeader
}

export type BffCookieSource = 'header' | 'cookieStore' | 'both'

export function getResponseSetCookieList(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof h.getSetCookie === 'function') {
    return h.getSetCookie()
  }
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

export async function getBffCookieHeaderForTitan(request: Pick<Request, 'headers'>): Promise<{
  cookieHeader: string
  cookieSource: BffCookieSource
  refreshTokenFromStore?: string
}> {
  const requestCookieHeader = request.headers.get('cookie') || ''
  const cookieStore = await cookies()
  const cookiePairs: string[] = []
  for (const c of cookieStore.getAll()) {
    cookiePairs.push(`${c.name}=${c.value}`)
  }
  const cookieStoreHeader = cookiePairs.join('; ')
  const cookieHeader = buildBffCookieHeader(requestCookieHeader, cookieStoreHeader)
  let cookieSource: BffCookieSource
  if (requestCookieHeader && cookieStoreHeader) {
    cookieSource = 'both'
  } else if (requestCookieHeader) {
    cookieSource = 'header'
  } else {
    cookieSource = 'cookieStore'
  }
  const refreshTokenFromStore = cookieStore.get('upswitch_refresh_token')?.value
  return { cookieHeader, cookieSource, refreshTokenFromStore }
}
