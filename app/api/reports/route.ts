/**
 * Reports Route - Venus
 *
 * World-Class API Optimization:
 * - Response caching with appropriate TTL
 * - Optimized query parameters
 * - Reduced payload size
 * - Efficient pagination
 *
 * Proxies to Titan API to get reports list.
 * Handles both authenticated and guest users.
 *
 * Following Mercury's proven pattern for cross-subdomain authentication.
 */

import { cookies, headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - this route uses cookies(), headers(), and searchParams which are dynamic
export const dynamic = 'force-dynamic'

// Simple in-memory cache for reports (Next.js server-side)
const reportsCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30 * 1000 // 30 seconds cache for reports list

function getCacheKey(userId: string | null, skip: number, take: number, status: string): string {
  return `reports_${userId || 'guest'}_${skip}_${take}_${status}`
}

function getCached(key: string): any | null {
  const cached = reportsCache.get(key)
  if (!cached) return null

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    reportsCache.delete(key)
    return null
  }

  return cached.data
}

function setCache(key: string, data: any): void {
  // Limit cache size (keep only last 50 entries)
  if (reportsCache.size > 50) {
    const oldestKey = Array.from(reportsCache.keys())[0]
    reportsCache.delete(oldestKey)
  }

  reportsCache.set(key, {
    data,
    timestamp: Date.now(),
  })
}

export async function GET(request: NextRequest) {
  try {
    const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app'

    // Get query parameters with defaults
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100) // Max 100
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0) // Min 0

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

    // Get user ID from cookies for cache key
    const hasAccessToken = cookieHeader.includes('upswitch_access_token=')
    const userId = hasAccessToken ? 'authenticated' : null

    // Get guest session ID from headers if present
    const requestHeaders = await headers()
    const guestSessionId = requestHeaders.get('x-guest-session-id')

    // Check cache first
    const status = searchParams.get('status') || 'all'
    const skip = offset
    const take = limit
    const cacheKey = getCacheKey(userId, skip, take, status)
    const cached = getCached(cacheKey)

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT',
        },
      })
    }

    // Build headers for Titan request
    const titanHeaders: HeadersInit = {
      Cookie: cookieHeader,
    }

    // Forward guest session ID if present
    if (guestSessionId) {
      titanHeaders['x-guest-session-id'] = guestSessionId
    }

    // Forward request to Titan API with optimized parameters
    const response = await fetch(
      `${titanApiUrl}/api/v2/valuations/reports?skip=${skip}&take=${take}&status=${status}`,
      {
        method: 'GET',
        headers: titanHeaders,
        // Add cache headers for Titan request
        next: {
          revalidate: 30, // Revalidate every 30 seconds
        },
      }
    )

    if (!response.ok) {
      console.error('[Venus /api/reports] Titan response not OK:', {
        status: response.status,
        statusText: response.statusText,
      })
      return NextResponse.json({ error: 'Failed to fetch reports' }, { status: response.status })
    }

    const data = await response.json()

    // Cache the response
    setCache(cacheKey, data)

    // Return with optimized cache headers
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'X-Cache': 'MISS',
        // Optimize payload by removing unnecessary headers
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('[Venus /api/reports] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
