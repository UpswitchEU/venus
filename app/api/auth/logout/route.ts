/**
 * Logout Route - Venus
 *
 * Proxies to Titan API to logout and clears ALL HTTP-only cookies.
 * Ensures complete cleanup across all subdomains.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 * Bank-grade: server-safe Titan URL, fetch timeout.
 */

import { NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const titanApiUrl = getTitanApiUrl(request)

    const response = await fetchWithTimeout(`${titanApiUrl}/api/v2/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: request.headers.get('cookie') || '',
      },
    })

    // Create response
    const nextResponse = NextResponse.json({ success: true })

    // Get Set-Cookie headers from Titan (to clear cookies)
    // Use getSetCookie() to get all cookies, then append each one
    const setCookieHeaders = response.headers.getSetCookie()

    // Forward cookie clearing headers from Titan
    setCookieHeaders.forEach((cookie) => {
      nextResponse.headers.append('Set-Cookie', cookie)
    })

    // Explicitly clear all known auth cookies with proper settings
    const cookiesToClear = [
      'upswitch_access_token',
      'upswitch_refresh_token',
      'upswitch_session',
      'access_token',
    ]

    cookiesToClear.forEach((cookieName) => {
      // Clear with domain to ensure removal across all subdomains (match Mercury)
      const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '.upswitch.app'
      nextResponse.headers.append(
        'Set-Cookie',
        `${cookieName}=; Path=/; Domain=${cookieDomain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=None; Secure`
      )
    })

    return nextResponse
  } catch (error) {
    console.error('[Venus /api/auth/logout] Error:', error)

    // Even on error, clear cookies and return success
    const nextResponse = NextResponse.json({ success: true })

    const cookiesToClear = [
      'upswitch_access_token',
      'upswitch_refresh_token',
      'upswitch_session',
      'access_token',
    ]

    cookiesToClear.forEach((cookieName) => {
      // Clear with domain to ensure removal across all subdomains (match Mercury)
      const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '.upswitch.app'
      nextResponse.headers.append(
        'Set-Cookie',
        `${cookieName}=; Path=/; Domain=${cookieDomain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=None; Secure`
      )
    })

    return nextResponse
  }
}
