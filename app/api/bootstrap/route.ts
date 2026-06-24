/**
 * Bootstrap API Route
 *
 * Proxies bootstrap requests to Titan API for unified session initialization.
 * This enables same-origin requests from Venus client to avoid CORS issues.
 *
 * BANK GRADE: Handles 401 errors by attempting token refresh and retry.
 * Uses getTitanApiUrl(request), fetchWithTimeout with a route-level budget.
 *
 * @module api/bootstrap
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  bootstrapTitanCallTimeoutMs,
  remainingBootstrapRouteBudgetMs,
  VENUS_BOOTSTRAP_TOKEN_REFRESH_TIMEOUT_MS,
} from '@/lib/bootstrap/bootstrapProxyTimeouts'
import { classifyRefreshStatus } from '@/utils/auth/refreshMutex'
import {
  AuthUpstreamTimeoutError,
  getBffCookieHeaderForTitan,
  getResponseSetCookieList,
} from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { generalLogger } from '@/utils/logger'
import {
  CLIENT_CONTEXT_HEADERS,
  extractClientContextFromHeaders,
} from '../../../src/constants/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Attempt to refresh the access token and return new cookies.
 *
 * `transient` distinguishes a definitive auth rejection (refresh token
 * genuinely invalid → the user must log in again) from transient backend
 * unavailability (Titan 5xx/408/429 under pool pressure, or a timeout/network
 * drop → the session is still valid, just retry). The caller MUST NOT convert a
 * transient failure into a 401: doing so ejected a cookie-valid advisor to the
 * Mercury login page during the 2026-06-10 pool-exhaustion incident.
 */
async function tryRefreshToken(
  request: NextRequest,
  timeoutMs: number
): Promise<{ success: boolean; newCookies: string[]; transient: boolean }> {
  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { cookieHeader, refreshTokenFromStore } = await getBffCookieHeaderForTitan(request)
    const refreshResponse = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/auth/refresh`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: refreshTokenFromStore || undefined }),
      },
      timeoutMs
    )

    if (!refreshResponse.ok) {
      // Only a definitive 401/403 is an auth verdict; everything else
      // (5xx/408/429/unknown) is the auth service being unavailable.
      const transient = classifyRefreshStatus(refreshResponse.status) !== 'auth_failed'
      generalLogger.warn('[Bootstrap Route] Token refresh failed', {
        status: refreshResponse.status,
        transient,
      })
      return { success: false, newCookies: [], transient }
    }

    const newCookies = getResponseSetCookieList(refreshResponse)
    generalLogger.debug('[Bootstrap Route] Token refresh successful', {
      newCookiesCount: newCookies.length,
    })

    return { success: true, newCookies, transient: false }
  } catch (error) {
    // A thrown refresh (timeout/abort/network drop) never saw an auth verdict.
    generalLogger.error('[Bootstrap Route] Token refresh error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, newCookies: [], transient: true }
  }
}

/**
 * Build cookie header from original cookies + new cookies
 * New cookies override old ones with the same name
 */
function mergeCookies(originalCookieHeader: string, newCookies: string[]): string {
  const cookieMap = new Map<string, string>()

  if (originalCookieHeader) {
    originalCookieHeader.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.trim().split('=')
      if (name) {
        cookieMap.set(name, rest.join('='))
      }
    })
  }

  newCookies.forEach((setCookie) => {
    const [nameValue] = setCookie.split(';')
    const [name, ...rest] = nameValue.split('=')
    if (name) {
      cookieMap.set(name.trim(), rest.join('='))
    }
  })

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function isUpstreamTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    error instanceof AuthUpstreamTimeoutError ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error &&
      (error.name === 'AuthUpstreamTimeoutError' ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError')) ||
    message.includes('timeout') ||
    message.includes('aborted')
  )
}

async function withRouteBodyBudget<T>(
  operation: () => Promise<T>,
  startTime: number,
  targetHost = 'titan-bootstrap-body'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new AuthUpstreamTimeoutError(targetHost)),
          remainingBootstrapRouteBudgetMs(startTime)
        )
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * POST /api/bootstrap
 *
 * Proxies bootstrap request to Titan API with cookies.
 * Handles 401 by attempting token refresh and retry.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))

    let cookieHeader = (await getBffCookieHeaderForTitan(request)).cookieHeader

    const guestSessionId = request.headers.get('x-guest-session-id')

    const clientContext = extractClientContextFromHeaders((name: string) =>
      request.headers.get(name)
    )

    const hasClientContext = !!clientContext
    const clientContextKeys = clientContext ? Object.keys(clientContext) : []
    if (!hasClientContext && (body.clientToken || body.clientId)) {
      generalLogger.warn(
        '[Bootstrap Route] Client token/ID in body but no client context headers received',
        {
          hasClientToken: !!body.clientToken,
          hasClientId: !!body.clientId,
          note: 'Client context may not be in store when Venus built the request',
        }
      )
    }
    generalLogger.debug('[Bootstrap Route] Client context forwarding', {
      hasClientContext,
      clientContextKeys,
      hasCookies: !!cookieHeader,
    })

    const correlationId =
      request.headers.get('x-correlation-id') || request.headers.get('x-request-id')

    const buildTitanHeaders = (cookies: string): Record<string, string> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }

      if (cookies) {
        headers['Cookie'] = cookies
      }

      if (guestSessionId) {
        headers['X-Guest-Session-Id'] = guestSessionId
      }

      if (correlationId) {
        headers['X-Correlation-ID'] = correlationId
      }

      if (clientContext) {
        if (clientContext.clientUserId) {
          headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientContext.clientUserId
        }
        headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = clientContext.accountantUserId
        if (clientContext.relationshipId) {
          headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = clientContext.relationshipId
        }
      }

      return headers
    }

    const titanApiUrl = getTitanApiUrl(request)
    const titanBootstrapUrl = `${titanApiUrl}/api/v2/valuations/bootstrap`

    generalLogger.debug('[Bootstrap Route] Proxying to Titan', {
      correlationId: correlationId || undefined,
      url: titanBootstrapUrl,
      reportId: body.reportId?.substring(0, 30) || 'NONE',
      reportIdLength: body.reportId?.length || 0,
      reportIdType: typeof body.reportId,
      hasBody: !!body && Object.keys(body).length > 0,
      bodyKeys: Object.keys(body || {}),
      hasCookies: !!cookieHeader,
      hasGuestSessionId: !!guestSessionId,
      hasClientContext,
    })

    const callTitan = (cookies: string) =>
      fetchWithTimeout(
        titanBootstrapUrl,
        {
          method: 'POST',
          headers: buildTitanHeaders(cookies),
          body: JSON.stringify(body),
        },
        bootstrapTitanCallTimeoutMs(startTime)
      )

    let response = await callTitan(cookieHeader)

    let allSetCookieHeaders: string[] = []

    if (response.status === 401) {
      generalLogger.debug('[Bootstrap Route] Got 401, attempting token refresh')

      const refreshTimeoutMs = Math.min(
        VENUS_BOOTSTRAP_TOKEN_REFRESH_TIMEOUT_MS,
        remainingBootstrapRouteBudgetMs(startTime)
      )
      const refreshResult = await tryRefreshToken(request, refreshTimeoutMs)

      if (refreshResult.success && refreshResult.newCookies.length > 0) {
        allSetCookieHeaders = refreshResult.newCookies

        const mergedCookies = mergeCookies(cookieHeader, refreshResult.newCookies)

        generalLogger.debug('[Bootstrap Route] Retrying bootstrap with refreshed token')

        response = await callTitan(mergedCookies)

        const retryCookies = getResponseSetCookieList(response)
        allSetCookieHeaders.push(...retryCookies)
      } else if (refreshResult.transient) {
        // The refresh hop could not complete because Titan was transiently
        // unavailable (5xx/408/429/timeout), NOT because the session is
        // invalid. Returning 401 here would make SessionBootstrapService throw
        // AuthenticationRequiredError → a hard redirect to Mercury login for a
        // cookie-valid user. Return 503 instead, which the client maps to a
        // retryable "temporarily unavailable" state.
        generalLogger.warn(
          '[Bootstrap Route] Token refresh temporarily unavailable - returning 503 (not a logout)'
        )
        return NextResponse.json(
          {
            success: false,
            error: 'Authentication temporarily unavailable',
            message: 'Could not verify your session right now. Please try again in a moment.',
            bootstrapDurationMs: Date.now() - startTime,
          },
          { status: 503 }
        )
      } else {
        generalLogger.warn('[Bootstrap Route] Token refresh failed - returning 401')
        return NextResponse.json(
          {
            success: false,
            error: 'Session expired',
            message: 'Token refresh failed. Please log in again.',
          },
          { status: 401 }
        )
      }
    } else {
      allSetCookieHeaders = getResponseSetCookieList(response)
    }

    let data: Record<string, unknown>
    try {
      data = await withRouteBodyBudget(
        () => response.json() as Promise<Record<string, unknown>>,
        startTime
      )
    } catch (error) {
      if (isUpstreamTimeoutError(error)) {
        throw error
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid response from bootstrap service',
          bootstrapDurationMs: Date.now() - startTime,
        },
        { status: response.ok ? 502 : response.status }
      )
    }

    const durationMs = Date.now() - startTime
    generalLogger.debug('[Bootstrap Route] Response received', {
      status: response.status,
      success: data.success,
      durationMs,
      bootstrapDurationMs: data.bootstrapDurationMs,
    })

    const nextResponse = NextResponse.json(data, {
      status: response.status,
    })

    for (const cookie of allSetCookieHeaders) {
      nextResponse.headers.append('Set-Cookie', cookie)
    }

    return nextResponse
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startTime

    if (isUpstreamTimeoutError(error)) {
      generalLogger.error('[Bootstrap Route] Request timed out', { durationMs })
      return NextResponse.json(
        { success: false, error: 'Bootstrap request timed out', bootstrapDurationMs: durationMs },
        { status: 504 }
      )
    }

    generalLogger.error('[Bootstrap Route] Error', {
      error: errorMessage,
      durationMs,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to bootstrap session',
        details: errorMessage,
        bootstrapDurationMs: durationMs,
      },
      { status: 500 }
    )
  }
}
