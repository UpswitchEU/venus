/**
 * Auth Health Check - Venus
 *
 * Diagnostic endpoint for cookie/auth state. Used for debugging redirect loops
 * and cookie propagation issues. Returns safe, non-sensitive diagnostic info.
 *
 * GET /api/auth/health
 * - 200: Cookies present, auth/me succeeds
 * - 401: No cookies or auth/me failed (expected when logged out)
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasTitanAccessCookie, hasTitanRefreshCookie } from '@/utils/auth/cookieHeader'
import {
  AUTH_FETCH_TIMEOUT_AUTH_ME_MS,
  AuthUpstreamTimeoutError,
  getBffCookieHeaderForTitan,
  getResponseSetCookieList,
} from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** Mirrors `/api/auth/me`: one Titan `/me-or-refresh` hop plus route/cookie overhead. */
export const maxDuration = 15

function appendForwardedSetCookies(res: NextResponse, setCookies: string[]): void {
  for (const c of setCookies) {
    res.headers.append('Set-Cookie', c)
  }
}

function readErrorMessage(errorData: unknown): string | undefined {
  if (!errorData || typeof errorData !== 'object' || Array.isArray(errorData)) return undefined
  const message = (errorData as { message?: unknown }).message
  return typeof message === 'string' && message.trim() ? message : undefined
}

export async function GET(request: NextRequest) {
  try {
    const { cookieHeader, cookieSource } = await getBffCookieHeaderForTitan(request)

    const hasAccessToken = hasTitanAccessCookie(cookieHeader)
    const hasRefreshToken = hasTitanRefreshCookie(cookieHeader)

    const health = {
      hasAccessToken,
      hasRefreshToken,
      hasAnyAuthCookie: hasAccessToken || hasRefreshToken,
      cookieSource,
    }

    if (!hasAccessToken && !hasRefreshToken) {
      return NextResponse.json(
        { ...health, status: 'no_cookies', message: 'No auth cookies present' },
        { status: 401 }
      )
    }

    const titanApiUrl = getTitanApiUrl(request)
    const { response: meResponse, json: responseBody } = await fetchJsonWithTimeout(
      `${titanApiUrl}/api/v2/auth/me-or-refresh`,
      {
        method: 'GET',
        headers: { Cookie: cookieHeader },
      },
      AUTH_FETCH_TIMEOUT_AUTH_ME_MS
    )
    const setCookiesToForward = getResponseSetCookieList(meResponse)

    if (!meResponse.ok) {
      const errorData = responseBody ?? {}

      if (meResponse.status === 429) {
        const res429 = NextResponse.json(
          {
            ...health,
            status: 'rate_limited',
            message: 'Too many requests. Please wait a moment and try again.',
            authMeStatus: meResponse.status,
          },
          { status: 429 }
        )
        appendForwardedSetCookies(res429, setCookiesToForward)
        return res429
      }

      if (meResponse.status === 502 || meResponse.status === 503) {
        const resUnavailable = NextResponse.json(
          {
            ...health,
            status: 'service_unavailable',
            message:
              readErrorMessage(errorData) || 'Authentication service temporarily unavailable',
            authMeStatus: meResponse.status,
          },
          { status: meResponse.status }
        )
        appendForwardedSetCookies(resUnavailable, setCookiesToForward)
        return resUnavailable
      }

      const res401 = NextResponse.json(
        {
          ...health,
          status: 'auth_failed',
          message: 'auth/me-or-refresh returned non-OK',
          authMeStatus: meResponse.status,
        },
        { status: 401 }
      )
      appendForwardedSetCookies(res401, setCookiesToForward)
      return res401
    }

    const resOk = NextResponse.json({
      ...health,
      status: 'ok',
      message: 'Auth cookies valid',
    })
    appendForwardedSetCookies(resOk, setCookiesToForward)
    return resOk
  } catch (error) {
    if (error instanceof AuthUpstreamTimeoutError) {
      return NextResponse.json(
        {
          status: 'timeout',
          message: error.message,
        },
        { status: 504 }
      )
    }
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
