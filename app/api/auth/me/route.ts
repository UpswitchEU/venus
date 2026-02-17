/**
 * Get Current User Route - Venus
 *
 * Proxies to Titan API to get current user from HTTP-only cookies.
 * This ensures cookies are properly validated server-side.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 * Bank-grade: server-safe Titan URL, 5xx vs 401 differentiation, fetch timeout.
 */

import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { generalLogger } from '@/utils/logger'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const titanApiUrl = getTitanApiUrl(request)

    // CRITICAL: Prioritize request headers for cookies (works in iframe context)
    // HTTP-only cookies set for .upswitch.app domain are sent in request headers
    // but may not be accessible via cookies() helper in iframe context
    const requestCookieHeader = request.headers.get('cookie') || ''

    // Also try cookies() helper as fallback
    const cookieStore = await cookies()
    const cookiePairs: string[] = []
    cookieStore.getAll().forEach((cookie) => {
      cookiePairs.push(`${cookie.name}=${cookie.value}`)
    })
    const cookieStoreHeader = cookiePairs.join('; ')

    // Use request headers first (contains all cookies sent by browser), fallback to cookie store
    const cookieHeader = requestCookieHeader || cookieStoreHeader

    // Check for auth tokens in cookie header string
    const hasAccessToken = cookieHeader.includes('upswitch_access_token=')
    const hasRefreshToken = cookieHeader.includes('upswitch_refresh_token=')

    generalLogger.debug('[Venus /api/auth/me] Cookie state', {
      hasAccessToken,
      hasRefreshToken,
      hasRequestCookies: !!requestCookieHeader,
      hasCookieStoreCookies: cookiePairs.length > 0,
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
      }
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

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    generalLogger.error('[Venus /api/auth/me] Error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
