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
} from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { generalLogger } from '@/utils/logger'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'
/** Room for refresh + GET /me BFF→Titan when only refresh cookie is present. */
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { cookieHeader, cookieSource } = await getBffCookieHeaderForTitan(request)

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

    // Forward request to Titan API with cookies (with timeout)
    const response = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/auth/me`,
      {
        method: 'GET',
        headers: {
          Cookie: cookieHeader,
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
        return NextResponse.json(
          {
            isAuthenticated: false,
            error: 'Server error',
            message: errorData.message || 'Authentication service temporarily unavailable',
            details: process.env.NODE_ENV === 'development' ? errorData : undefined,
          },
          { status: 500 }
        )
      }

      return NextResponse.json({ isAuthenticated: false }, { status: 401 })
    }

    const data = await response.json()

    const res = NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })

    // Forward Set-Cookie headers from Titan so token rotations reach the browser
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
