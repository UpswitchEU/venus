/**
 * Language Preference API Route
 *
 * Proxies language preference updates to Titan API
 */

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'

// Force dynamic rendering - this route uses cookies
export const dynamic = 'force-dynamic'

/**
 * Update user language preference
 * PUT /api/user/language
 */
export async function PUT(request: NextRequest) {
  try {
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

    // Check for auth token in cookie header string
    const hasAccessToken = cookieHeader.includes('upswitch_access_token=')

    if (!hasAccessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { language } = body

    // Validate language
    if (!language || !['en', 'nl'].includes(language)) {
      return NextResponse.json({ error: 'Invalid language. Must be "en" or "nl"' }, { status: 400 })
    }

    // Get backend URL from environment
    const backendUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'https://api.upswitch.app'

    // Forward request to Titan API with cookies
    const titanApiUrl = `${backendUrl}/api/v2/users/language`

    const response = await fetchWithTimeout(titanApiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ language }),
    }, 10_000)

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: 'Failed to update language preference' }))
      return NextResponse.json(
        { error: error.message || 'Failed to update language preference' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error('[Venus /api/user/language] Error:', error)
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out' : 'Internal server error' },
      { status: isTimeout ? 504 : 500 },
    )
  }
}
