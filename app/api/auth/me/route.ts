/**
 * Get Current User Route - Venus
 *
 * Proxies to Titan API to get current user from HTTP-only cookies.
 * This ensures cookies are properly validated server-side.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 * Bank-grade: server-safe Titan URL, 5xx vs 401 differentiation, fetch timeout.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  AUTH_FETCH_TIMEOUT_AUTH_ME_MS,
  AuthUpstreamTimeoutError,
  getBffCookieHeaderForTitan,
  getResponseSetCookieList,
  mergeCookieHeaderFromSetCookieHeaders,
} from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { generalLogger } from '@/utils/logger'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** Room for refresh + GET /me BFF→Titan when only refresh cookie is present. */
export const maxDuration = 30

function appendForwardedSetCookies(res: NextResponse, setCookies: string[]): void {
  for (const c of setCookies) {
    res.headers.append('Set-Cookie', c)
  }
}

export async function GET(request: NextRequest) {
  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { cookieHeader: initialCookieHeader, cookieSource } =
      await getBffCookieHeaderForTitan(request)

    let cookieHeader = initialCookieHeader
    let setCookiesToForward: string[] = []
    /** Bearer fallback when server-side refresh returns a JSON token but Set-Cookie is stripped (rare cross-domain cases). */
    const meAuthHeaders: Record<string, string> = {}

    const hasAccessToken = cookieHeader.includes('upswitch_access_token=')
    const hasRefreshToken = cookieHeader.includes('upswitch_refresh_token=')

    generalLogger.debug('[Venus /api/auth/me] Cookie state', {
      hasAccessToken,
      hasRefreshToken,
      cookieSource,
    })

    if (!hasAccessToken && !hasRefreshToken) {
      // Return 401 with isAuthenticated: false (not an error condition)
      return NextResponse.json({ isAuthenticated: false }, { status: 401 })
    }

    // BFF-side refresh hop (mirrors Mercury): when the browser only has a
    // refresh cookie (returning user whose 15-min access cookie expired,
    // OAuth right after callback, etc.), do the rotation here so the same
    // request can complete with `200 + user` and a fresh `Set-Cookie`,
    // instead of forcing the client into a `/me 401 → /refresh → /me` chain.
    if (hasRefreshToken && !hasAccessToken) {
      try {
        const refreshRes = await fetchWithTimeout(
          `${titanApiUrl}/api/v2/auth/refresh`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: cookieHeader,
            },
            body: JSON.stringify({}),
          },
          AUTH_FETCH_TIMEOUT_AUTH_ME_MS
        )
        if (refreshRes.ok) {
          setCookiesToForward = getResponseSetCookieList(refreshRes)
          let refreshBodyToken: string | undefined
          try {
            const refreshData = (await refreshRes.clone().json()) as { token?: unknown }
            if (typeof refreshData?.token === 'string' && refreshData.token.length > 0) {
              refreshBodyToken = refreshData.token
            }
          } catch {
            // non-JSON body — rely on Set-Cookie only
          }
          if (setCookiesToForward.length > 0) {
            cookieHeader = mergeCookieHeaderFromSetCookieHeaders(cookieHeader, setCookiesToForward)
          }
          if (refreshBodyToken && !cookieHeader.includes('upswitch_access_token=')) {
            meAuthHeaders.Authorization = `Bearer ${refreshBodyToken}`
          }
        }
      } catch (e) {
        if (e instanceof AuthUpstreamTimeoutError) {
          const res504 = NextResponse.json(
            {
              isAuthenticated: false,
              error: 'upstream_timeout',
              message: 'Authentication service did not respond in time',
            },
            { status: 504 }
          )
          appendForwardedSetCookies(res504, setCookiesToForward)
          return res504
        }
        throw e
      }
    }

    // If after the optional refresh hop we still have no usable credential,
    // surface 401 cleanly instead of letting Titan return its own.
    if (
      !cookieHeader.includes('upswitch_access_token=') &&
      !cookieHeader.includes('upswitch_refresh_token=') &&
      !meAuthHeaders.Authorization
    ) {
      const res401 = NextResponse.json({ isAuthenticated: false }, { status: 401 })
      appendForwardedSetCookies(res401, setCookiesToForward)
      return res401
    }

    // Forward request to Titan API with cookies (with timeout)
    const response = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/auth/me`,
      {
        method: 'GET',
        headers: {
          Cookie: cookieHeader,
          ...meAuthHeaders,
        },
      },
      AUTH_FETCH_TIMEOUT_AUTH_ME_MS
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      if (response.status >= 500) {
        generalLogger.error('[Venus /api/auth/me] Titan API server error', {
          status: response.status,
          error: errorData,
          titanUrl: `${titanApiUrl}/api/v2/auth/me`,
        })
        const res500 = NextResponse.json(
          {
            isAuthenticated: false,
            error: 'Server error',
            message: errorData.message || 'Authentication service temporarily unavailable',
            details: process.env.NODE_ENV === 'development' ? errorData : undefined,
          },
          { status: 500 }
        )
        appendForwardedSetCookies(res500, setCookiesToForward)
        return res500
      }

      const res401 = NextResponse.json({ isAuthenticated: false }, { status: 401 })
      appendForwardedSetCookies(res401, setCookiesToForward)
      return res401
    }

    const data = await response.json()

    const res = NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })

    // Forward Set-Cookie from the BFF refresh hop FIRST (the rotated tokens
    // we just minted). Titan's `/me` itself does not rotate, but if it
    // ever started, those would override here in the natural order.
    appendForwardedSetCookies(res, setCookiesToForward)
    const setCookies = getResponseSetCookieList(response)
    for (const cookie of setCookies) {
      res.headers.append('Set-Cookie', cookie)
    }

    return res
  } catch (error) {
    if (error instanceof AuthUpstreamTimeoutError) {
      generalLogger.error('[Venus /api/auth/me] upstream timeout (BFF→Titan)', {
        code: error.code,
        targetHost: error.targetHost,
      })
      return NextResponse.json(
        {
          isAuthenticated: false,
          error: 'upstream_timeout',
          message: 'Authentication service did not respond in time',
        },
        { status: 504 }
      )
    }
    generalLogger.error('[Venus /api/auth/me] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
