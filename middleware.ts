/**
 * Next.js Middleware for Venus
 * Handles i18n routing with locale detection and redirection.
 * Auth: cookie-exists check for /reports/[id] (the only auth-gated route).
 * AuthGate remains as defense-in-depth for client context exchange.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import {
  getReportIdRequiringAuth,
  hasReportAccessCookie,
  redirectToMercuryLogin,
  shouldAllowLocalDevelopmentDraftReportRequest,
} from '@/middleware/reportAccess'
import { MERCURY_SITE_WWW_CANONICAL, tryNormalizeToOrigin } from '@/utils/normalizeExplicitUrl'
import { defaultLocale, locales } from './i18n'

/**
 * Derive Mercury URL from request hostname (Edge Runtime compatible).
 * Mirrors getMercuryUrl() logic but uses request headers instead of window.location.
 */
function deriveMercuryUrl(request: NextRequest): string {
  const envRaw = process.env.NEXT_PUBLIC_MERCURY_URL || process.env.NEXT_PUBLIC_PARENT_DOMAIN
  if (envRaw?.trim()) {
    const origin = tryNormalizeToOrigin(envRaw)
    if (origin) return origin
  }

  const host = request.headers.get('host') || ''
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return 'http://localhost:3000'
  }
  if (host.startsWith('preview.valuation.')) {
    return `https://preview.${host.replace('preview.valuation.', '')}`
  }
  if (host.startsWith('staging.valuation.')) {
    return `https://staging.${host.replace('staging.valuation.', '')}`
  }
  if (host.startsWith('valuation.')) {
    const hostOnly = host.split(':')[0]
    const apex = hostOnly.replace(/^valuation\./, '')
    if (apex === 'upswitch.app') return MERCURY_SITE_WWW_CANONICAL
    return `https://${apex}`
  }
  return MERCURY_SITE_WWW_CANONICAL
}

/**
 * Create i18n middleware with next-intl
 */
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always', // Always use /en/ or /nl/ prefix
  localeDetection: true, // Auto-detect from Accept-Language header or cookie
})

const VENUS_FRAME_ANCESTORS = "frame-ancestors 'self' https://upswitch.app https://*.upswitch.app"
const localePathPrefixPattern = /^\/(en|nl|fr)(?=\/|$)/
const localePathStripPattern = /^\/(?:en|nl|fr)(?=\/|$)/

function withEmbeddingHeaders(response: Response): void {
  response.headers.delete('X-Frame-Options')

  const existingCSP = response.headers.get('Content-Security-Policy')
  if (existingCSP?.includes('frame-ancestors')) {
    return
  }

  response.headers.set(
    'Content-Security-Policy',
    existingCSP ? `${existingCSP}; ${VENUS_FRAME_ANCESTORS}` : VENUS_FRAME_ANCESTORS
  )
}

/**
 * Cookie options for NEXT_LOCALE - use cross-subdomain domain in production
 * so Mercury (upswitch.app) and Venus (valuation.upswitch.app) share the cookie
 */
function getLocaleCookieOptions(request: NextRequest): {
  path: string
  maxAge: number
  sameSite: 'lax'
  domain?: string
} {
  const host = request.headers.get('host') || request.nextUrl.hostname || ''
  const isProduction = host.includes('upswitch.app')
  return {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    ...(isProduction && { domain: '.upswitch.app' }),
  }
}

/**
 * Detect locale from query param, return_url (Mercury flow), cookie, or Accept-Language header
 */
function detectLocale(request: NextRequest): string {
  const localeParam = request.nextUrl.searchParams.get('locale')?.trim()
  if (localeParam && locales.includes(localeParam as (typeof locales)[number])) {
    return localeParam
  }
  // When source=mercury, parse return_url for locale (e.g. .../nl/advisor/clients/...)
  if (request.nextUrl.searchParams.get('source') === 'mercury') {
    const returnUrl = request.nextUrl.searchParams.get('return_url')
    if (returnUrl) {
      try {
        const path = new URL(returnUrl).pathname
        const m = path.match(/\/(en|nl|fr)(\/|$)/)
        if (m && locales.includes(m[1] as (typeof locales)[number])) {
          return m[1]
        }
      } catch {
        // Invalid URL, continue to other sources
      }
    }
  }
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value?.trim()
  if (cookieLocale && locales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale
  }
  // Geo: Belgian/Dutch IP → nl (overrides Accept-Language for first visit)
  // x-vercel-ip-country is set by Vercel Edge; null locally
  const country = request.headers.get('x-vercel-ip-country')?.trim()?.toUpperCase()
  if (country === 'BE' || country === 'NL') {
    return 'nl'
  }
  const acceptLang = request.headers.get('accept-language')
  if (acceptLang) {
    // Parse Accept-Language (e.g. "nl-BE,nl;q=0.9,en;q=0.8") and pick first supported
    const preferred = acceptLang.split(',').map((s) => s.split(';')[0].trim().slice(0, 2))
    for (const lang of preferred) {
      if (locales.includes(lang as (typeof locales)[number])) {
        return lang
      }
    }
  }
  return defaultLocale
}

/**
 * Middleware function
 * Runs on every request
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files, api routes, and assets
  // Belt-and-suspenders: explicit manifest.json skip (matcher also excludes paths with dots)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname === '/manifest.json' ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next()
  }

  // Priority 0a: /calculate and /calculator without locale (Clarity Aurora parity)
  const calculatorMatch = pathname === '/calculate' || pathname === '/calculator'
  if (calculatorMatch) {
    const locale = detectLocale(request)
    const newUrl = request.nextUrl.clone()
    newUrl.pathname = `/${locale}/reports/new`
    return NextResponse.redirect(newUrl)
  }

  // Priority 0b: /reports/:id without locale prefix (Mercury embedding)
  // Redirect to /{locale}/reports/:id using detected locale instead of hardcoding /en/
  const reportsMatch = pathname.match(/^\/reports\/([^/]+)$/)
  if (reportsMatch) {
    const reportId = reportsMatch[1]
    const locale = detectLocale(request)
    const newUrl = request.nextUrl.clone()
    newUrl.pathname = `/${locale}/reports/${reportId}`
    return NextResponse.redirect(newUrl)
  }

  // Path locale always wins: when path has /en, /nl, or /fr, use it and set cookie — never redirect
  const pathLocaleMatch = pathname.match(localePathPrefixPattern)
  if (pathLocaleMatch) {
    const pathLocale = pathLocaleMatch[1]
    const pathWithoutLocale = pathname.replace(localePathStripPattern, '')

    // Auth check: /reports/:id needs at least one auth cookie.
    // Accept either the 15-min access token OR the 7-day refresh token —
    // the latter covers returning users whose access cookie expired but
    // who can still renew transparently via the BFF refresh hop. Only
    // kick the user back to Mercury login when both cookies are gone.
    // Skip /reports/new (redirect route, no auth needed).
    const protectedReportId = getReportIdRequiringAuth(pathWithoutLocale)
    if (protectedReportId) {
      if (
        !hasReportAccessCookie(request) &&
        !shouldAllowLocalDevelopmentDraftReportRequest(request, protectedReportId)
      ) {
        const mercuryBase = deriveMercuryUrl(request)
        return redirectToMercuryLogin(request, pathLocale, mercuryBase)
      }
    }

    const response = intlMiddleware(request)
    if (response instanceof Response) {
      response.cookies.set('NEXT_LOCALE', pathLocale, getLocaleCookieOptions(request))
      withEmbeddingHeaders(response)
    }
    return response
  }

  // Priority 1: Check for locale in URL params (from Mercury embedding)
  const localeParam = request.nextUrl.searchParams.get('locale')
  if (localeParam && locales.includes(localeParam as (typeof locales)[number])) {
    if (pathname.startsWith(`/${localeParam}/`)) {
      // Path already has the correct locale — strip the query param and return
      // to prevent intlMiddleware from overriding via Accept-Language header
      const cleanUrl = request.nextUrl.clone()
      cleanUrl.searchParams.delete('locale')
      const res = NextResponse.redirect(cleanUrl)
      res.cookies.set('NEXT_LOCALE', localeParam, getLocaleCookieOptions(request))
      return res
    }

    // Path does NOT have the locale prefix — redirect to /{locale}/...
    // Strip existing locale from path (e.g. /en/reports/123 -> /reports/123) before prepending new locale
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(\/|$)/, '$1') || '/'
    const newUrl = request.nextUrl.clone()
    newUrl.pathname = `/${localeParam}${pathWithoutLocale}`
    newUrl.searchParams.delete('locale')
    const res = NextResponse.redirect(newUrl)
    res.cookies.set('NEXT_LOCALE', localeParam, getLocaleCookieOptions(request))
    return res
  }

  // Let next-intl middleware handle all routing (including locale detection)
  // It will automatically detect locale from Accept-Language header and redirect/rewrite
  const response = intlMiddleware(request)

  // CRITICAL: Remove X-Frame-Options header if present (Vercel might set it by default)
  // We rely on CSP frame-ancestors instead for cross-subdomain embedding from upswitch.app
  if (response instanceof Response) {
    withEmbeddingHeaders(response)
  }

  return response
}

/**
 * Matcher for middleware
 * Only run middleware on specific paths
 */
export const config = {
  // Match all pathnames except for
  // - api routes
  // - _next (Next.js internals)
  // - static files
  matcher: ['/((?!api|_next|static|.*\\..*|favicon.ico).*)'],
}
