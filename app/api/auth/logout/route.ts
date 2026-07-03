/**
 * Logout Route - Venus
 *
 * Proxies to Titan, clears auth cookies (Mercury-grade multi-domain clears),
 * and supports navigational logout via GET ?fallback=1 (fast, no client fetch races).
 */

import { NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan, getResponseSetCookieList } from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { MERCURY_SITE_WWW_CANONICAL, tryNormalizeToOrigin } from '@/utils/normalizeExplicitUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const COOKIES_TO_CLEAR = [
  'upswitch_access_token',
  'upswitch_refresh_token',
  'upswitch_session',
  'upswitch_oauth_handshake',
  'access_token',
]

const VENUS_SITE_CANONICAL = 'https://valuation.upswitch.app'
const STATIC_TRUSTED_VENUS_REDIRECT_HOSTS = new Set([
  'valuation.upswitch.app',
  'preview.valuation.upswitch.app',
  'staging.valuation.upswitch.app',
  'valuation.upswitch.biz',
  'venus-git-main-upswitch.vercel.app',
  'venus-git-staging-upswitch.vercel.app',
])

function applyNoStoreHeaders(response: NextResponse): void {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
}

function getLocaleFromRequest(request: Request): 'en' | 'nl' | 'fr' {
  try {
    const referer = request.headers.get('referer')
    if (!referer) return 'en'

    const refererPath = new URL(referer).pathname
    if (refererPath === '/en' || refererPath.startsWith('/en/')) return 'en'
    if (refererPath === '/nl' || refererPath.startsWith('/nl/')) return 'nl'
    if (refererPath === '/fr' || refererPath.startsWith('/fr/')) return 'fr'
  } catch {
    // keep default
  }
  return 'en'
}

function getCookieDomainsToClear(request: Request): string[] {
  const domains = new Set<string>()

  const normalized = (value: string | undefined) => {
    let cleaned = value?.trim().toLowerCase()
    if (!cleaned) return
    cleaned = cleaned.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    cleaned = cleaned.split(':')[0]
    domains.add(cleaned.startsWith('.') ? cleaned : `.${cleaned}`)
  }

  normalized(process.env.COOKIE_DOMAIN)
  normalized(process.env.NEXT_PUBLIC_COOKIE_DOMAIN)

  try {
    const hostname = new URL(request.url).hostname
    normalized(hostname)
    if (hostname.startsWith('www.')) {
      normalized(hostname.slice(4))
    }
    const domainParts = hostname.split('.')
    if (domainParts.length > 1) {
      normalized(domainParts.slice(-2).join('.'))
    }
  } catch {
    // ignore
  }

  normalized('.upswitch.app')

  return [...domains]
}

function isLoopbackRedirectHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

function configuredVenusRedirectOrigins(): Set<string> {
  return new Set(
    [
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXT_PUBLIC_VENUS_URL,
      process.env.VERCEL_URL,
    ]
      .map(tryNormalizeToOrigin)
      .filter((origin): origin is string => Boolean(origin))
  )
}

function isTrustedVenusRedirectOrigin(origin: string | undefined): boolean {
  const normalized = tryNormalizeToOrigin(origin)
  if (!normalized) return false
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (isLoopbackRedirectHost(parsed.hostname)) return true
    if (STATIC_TRUSTED_VENUS_REDIRECT_HOSTS.has(parsed.hostname.toLowerCase())) return true
    return configuredVenusRedirectOrigins().has(parsed.origin)
  } catch {
    return false
  }
}

function venusRedirectOriginFromOrigin(origin: string | undefined): string {
  const normalized = tryNormalizeToOrigin(origin)
  if (normalized && isTrustedVenusRedirectOrigin(normalized)) return normalized
  return tryNormalizeToOrigin(process.env.NEXT_PUBLIC_BASE_URL) ?? VENUS_SITE_CANONICAL
}

function hasUnsafeInternalPathChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char === '\\' || code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function isInternalLogoutNextPath(raw: string | null): string | null {
  const next = raw?.trim()
  if (!next || hasUnsafeInternalPathChar(next)) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  try {
    const candidate = new URL(next, VENUS_SITE_CANONICAL)
    if (candidate.origin !== VENUS_SITE_CANONICAL) return null
    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return null
  }
}

/** Allowlisted Mercury login / home URLs only (open-redirect safe). */
function parseSafePostLogoutRedirect(request: Request): URL | null {
  const raw = new URL(request.url).searchParams.get('post_logout')
  if (!raw) return null

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (
    parsed.protocol === 'http:' &&
    parsed.hostname !== 'localhost' &&
    parsed.hostname !== '127.0.0.1'
  ) {
    return null
  }

  const trusted = new Set<string>()
  for (const env of [process.env.NEXT_PUBLIC_MERCURY_URL, process.env.NEXT_PUBLIC_PARENT_DOMAIN]) {
    if (!env?.trim()) continue
    const o = tryNormalizeToOrigin(env)
    if (o) trusted.add(o)
  }
  trusted.add('https://upswitch.app')
  trusted.add(MERCURY_SITE_WWW_CANONICAL)
  trusted.add('https://staging.upswitch.app')
  trusted.add('https://preview.upswitch.app')
  trusted.add('http://localhost:3000')

  if (!trusted.has(parsed.origin)) return null
  return parsed
}

function createLogoutRedirectResponse(request: Request): NextResponse {
  const locale = getLocaleFromRequest(request)
  const requestUrl = new URL(request.url)

  const external = parseSafePostLogoutRedirect(request)
  if (external) {
    return NextResponse.redirect(external.toString(), 303)
  }

  const rawNext = requestUrl.searchParams.get('next')
  const safeNext = isInternalLogoutNextPath(rawNext)
  const redirectUrl = new URL(
    safeNext ?? `/${locale}`,
    venusRedirectOriginFromOrigin(requestUrl.origin)
  )

  return NextResponse.redirect(redirectUrl, 303)
}

/**
 * Match Titan cookie identity for clears (RFC 6265). See Mercury
 * `apps/mercury/app/api/auth/logout/route.ts` — access/refresh use SameSite=None;
 * legacy `upswitch_session` may be Lax (Titan `clearAuthCookies` legacy branch).
 */
function appendCookieClearingHeaders(request: Request, response: NextResponse): void {
  const cookieDomains = getCookieDomainsToClear(request)

  const appendNoneClears = (cookieName: string): void => {
    cookieDomains.forEach((cookieDomain) => {
      response.headers.append(
        'Set-Cookie',
        `${cookieName}=; Path=/; Domain=${cookieDomain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=None; Secure`
      )
    })
    response.headers.append(
      'Set-Cookie',
      `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=None; Secure`
    )
  }

  const appendLaxClears = (cookieName: string): void => {
    cookieDomains.forEach((cookieDomain) => {
      response.headers.append(
        'Set-Cookie',
        `${cookieName}=; Path=/; Domain=${cookieDomain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
      )
    })
    response.headers.append(
      'Set-Cookie',
      `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
    )
  }

  COOKIES_TO_CLEAR.forEach((cookieName) => {
    appendNoneClears(cookieName)
    if (cookieName === 'upswitch_session') {
      appendLaxClears(cookieName)
    }
  })
}

function addTitanCookieClears(
  downstreamResponse: Response | null,
  request: Request,
  targetResponse: NextResponse
) {
  const setCookieHeaders = downstreamResponse ? getResponseSetCookieList(downstreamResponse) : []
  setCookieHeaders.forEach((cookie) => {
    targetResponse.headers.append('Set-Cookie', cookie)
  })
  appendCookieClearingHeaders(request, targetResponse)
}

/**
 * Build the logout response.
 *
 * Titan call is fire-and-forget: blocking on it caused multi-second
 * "spinning" during logout (cold-start latency). The BFF emits a
 * complete set of Set-Cookie clears for every relevant Domain, which
 * is the only thing the browser needs.
 */
async function buildLogoutResponse(
  request: Request,
  { redirect = false }: { redirect?: boolean } = {}
): Promise<NextResponse> {
  const response = redirect
    ? createLogoutRedirectResponse(request)
    : NextResponse.json({ success: true })
  applyNoStoreHeaders(response)

  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)

    void fetchWithTimeout(
      `${titanApiUrl}/api/v2/auth/logout`,
      {
        method: 'POST',
        headers: { Cookie: cookieHeader },
      },
      2_500
    ).catch((error) => {
      console.warn('[Venus /api/auth/logout] Titan signal failed (non-fatal):', error)
    })
  } catch (error) {
    console.warn('[Venus /api/auth/logout] Could not signal Titan (non-fatal):', error)
  }

  addTitanCookieClears(null, request, response)
  return response
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const shouldRedirect = requestUrl.searchParams.get('fallback') === '1'
  return buildLogoutResponse(request, { redirect: shouldRedirect })
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  if (requestUrl.searchParams.get('fallback') !== '1') {
    return NextResponse.json(
      { error: 'Use POST /api/auth/logout or add fallback=1 for browser navigational logout.' },
      { status: 405, headers: { Allow: 'POST' } }
    )
  }
  return buildLogoutResponse(request, { redirect: true })
}
