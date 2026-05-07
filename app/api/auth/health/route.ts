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
import {
  AUTH_FETCH_TIMEOUT_AUTH_ME_MS,
  AuthUpstreamTimeoutError,
  getBffCookieHeaderForTitan,
} from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const { cookieHeader, cookieSource } = await getBffCookieHeaderForTitan(request)

    const hasAccessToken = cookieHeader.includes('upswitch_access_token=')
    const hasRefreshToken = cookieHeader.includes('upswitch_refresh_token=')

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
    const meResponse = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/auth/me`,
      {
        method: 'GET',
        headers: { Cookie: cookieHeader },
      },
      AUTH_FETCH_TIMEOUT_AUTH_ME_MS
    )

    if (!meResponse.ok) {
      return NextResponse.json(
        {
          ...health,
          status: 'auth_failed',
          message: 'auth/me returned non-OK',
          authMeStatus: meResponse.status,
        },
        { status: 401 }
      )
    }

    return NextResponse.json({
      ...health,
      status: 'ok',
      message: 'Auth cookies valid',
    })
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
