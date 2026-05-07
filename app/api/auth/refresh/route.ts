/**
 * Refresh Token Route - Venus
 *
 * Proxies to Titan API to refresh access tokens using HTTP-only refresh cookies.
 * This ensures cookies are properly validated and set server-side.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 * Bank-grade: server-safe Titan URL, fetch timeout.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  AUTH_FETCH_TIMEOUT_MS,
  AuthUpstreamTimeoutError,
  getBffCookieHeaderForTitan,
  getResponseSetCookieList,
} from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { cookieHeader, refreshTokenFromStore } = await getBffCookieHeaderForTitan(request)

    const hasRefreshToken = cookieHeader.includes('upswitch_refresh_token=')

    if (!hasRefreshToken && !refreshTokenFromStore) {
      return NextResponse.json(
        {
          success: false,
          message: 'No refresh token found',
        },
        { status: 401 }
      )
    }

    const response = await fetchWithTimeout(
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
      AUTH_FETCH_TIMEOUT_MS
    )

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

    const setCookieHeaders = getResponseSetCookieList(response)
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
    if (error instanceof AuthUpstreamTimeoutError) {
      return NextResponse.json(
        {
          success: false,
          message: 'Request timed out. Please try again.',
        },
        { status: 504 }
      )
    }
    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}
