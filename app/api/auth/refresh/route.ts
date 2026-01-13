/**
 * Refresh Token Route - Venus
 *
 * Proxies to Titan API to refresh access tokens using HTTP-only refresh cookies.
 * This ensures cookies are properly validated and set server-side.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 */

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app'

    // CRITICAL: Prioritize request headers for cookies (works in iframe context)
    // HTTP-only cookies set for .upswitch.app domain are sent in request headers
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

    // Extract refresh token from cookie header string (fallback to cookie store)
    const refreshTokenFromStore = cookieStore.get('upswitch_refresh_token')?.value
    const hasRefreshToken = cookieHeader.includes('upswitch_refresh_token=')
    const refreshToken = refreshTokenFromStore || (hasRefreshToken ? 'present' : null)

    if (!hasRefreshToken && !refreshTokenFromStore) {
      return NextResponse.json(
        {
          success: false,
          message: 'No refresh token found',
        },
        { status: 401 }
      )
    }

    // Call Titan API refresh endpoint
    // Forward cookies in Cookie header (Titan will extract refresh token from cookies)
    // Also send refreshToken in body as fallback for cross-domain scenarios
    const response = await fetch(`${titanApiUrl}/api/v2/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader, // Forward cookies to Titan
      },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }), // Fallback for cross-domain scenarios
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Token refresh failed' }))
      return NextResponse.json(
        {
          success: false,
          message: errorData.message || 'Token refresh failed',
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Forward cookies from Titan API to client
    // Use getSetCookie() to match Mercury's pattern
    const setCookieHeaders = response.headers.getSetCookie()
    const nextResponse = NextResponse.json({
      success: true,
      data: data,
      message: 'Token refreshed successfully',
    })

    // Forward all Set-Cookie headers from Titan
    setCookieHeaders.forEach((cookie) => {
      nextResponse.headers.append('Set-Cookie', cookie)
    })

    return nextResponse
  } catch (error) {
    console.error('[POST /api/auth/refresh] Error:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}
