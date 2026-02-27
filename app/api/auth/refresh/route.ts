/**
 * Refresh Token Route - Venus
 *
 * Proxies to Titan API to refresh access tokens using HTTP-only refresh cookies.
 * This ensures cookies are properly validated and set server-side.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 * Bank-grade: server-safe Titan URL, fetch timeout.
 */

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const titanApiUrl = getTitanApiUrl(request)

    // CRITICAL: Prioritize request headers for cookies (works in iframe context)
    const requestCookieHeader = request.headers.get('cookie') || ''

    const cookieStore = await cookies()
    const cookiePairs: string[] = []
    cookieStore.getAll().forEach((cookie) => {
      cookiePairs.push(`${cookie.name}=${cookie.value}`)
    })
    const cookieStoreHeader = cookiePairs.join('; ')

    const cookieHeader = requestCookieHeader || cookieStoreHeader

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

    const response = await fetchWithTimeout(`${titanApiUrl}/api/v2/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
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

    const setCookieHeaders = response.headers.getSetCookie()
    const nextResponse = NextResponse.json({
      success: true,
      data: data,
      message: 'Token refreshed successfully',
    })

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
