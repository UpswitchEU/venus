/**
 * Get Current User Route - Venus
 *
 * Proxies to Titan API to get current user from HTTP-only cookies.
 * This ensures cookies are properly validated server-side.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 */

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app'

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

    // Cookie state check (silent - only log in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Venus /api/auth/me] Cookie state:', {
        hasAccessToken,
        hasRefreshToken,
        hasRequestCookies: !!requestCookieHeader,
        hasCookieStoreCookies: cookiePairs.length > 0,
        cookieHeaderLength: cookieHeader.length,
      })
    }

    if (!hasAccessToken && !hasRefreshToken) {
      // Return 401 with isAuthenticated: false (not an error condition)
      return NextResponse.json({ isAuthenticated: false }, { status: 401 })
    }

    // Forward request to Titan API with cookies
    const response = await fetch(`${titanApiUrl}/api/v2/auth/me`, {
      method: 'GET',
      headers: {
        // Forward cookies from request headers (contains all cookies sent by browser)
        Cookie: cookieHeader,
      },
      // CRITICAL: Don't include credentials here - we're manually forwarding cookies
      // Including credentials would try to send cookies from Venus's domain, not Titan's
    })

    if (!response.ok) {
      // User not authenticated - this is a valid state, not an error
      return NextResponse.json({ isAuthenticated: false }, { status: 401 })
    }

    const data = await response.json()

    // Return with no-cache headers to ensure fresh auth state
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('[Venus /api/auth/me] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
