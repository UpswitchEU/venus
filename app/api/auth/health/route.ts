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

import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const requestCookieHeader = request.headers.get('cookie') || ''
    const cookieStore = await cookies()
    const cookiePairs: string[] = []
    cookieStore.getAll().forEach((cookie) => {
      cookiePairs.push(`${cookie.name}=${cookie.value}`)
    })
    const cookieStoreHeader = cookiePairs.join('; ')
    const cookieHeader = requestCookieHeader || cookieStoreHeader

    const hasAccessToken = cookieHeader.includes('upswitch_access_token=')
    const hasRefreshToken = cookieHeader.includes('upswitch_refresh_token=')

    const health = {
      hasAccessToken,
      hasRefreshToken,
      hasAnyAuthCookie: hasAccessToken || hasRefreshToken,
      hasRequestCookies: !!requestCookieHeader,
      hasCookieStoreCookies: cookiePairs.length > 0,
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
      }
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
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
