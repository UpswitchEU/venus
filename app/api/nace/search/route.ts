/**
 * NACE Search API Proxy Route (Venus)
 *
 * Proxies NACE-related requests to the Titan backend API.
 * Supports:
 * - naceCode: reverse lookup NACE -> business type
 * - businessTypeId: fetch NACE codes for a business type
 * - q: search NACE codes by query
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const businessTypeId = searchParams.get('businessTypeId')
    const naceCode = searchParams.get('naceCode')
    const limit = searchParams.get('limit') || '10'
    const countryCode = searchParams.get('country_code')
    const guaranteeResolution = searchParams.get('guarantee_resolution')
    const guarantee = searchParams.get('guarantee')

    const titanUrl = getTitanApiUrl(request)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    try {
      let url: string
      if (naceCode) {
        const lookupParams = new URLSearchParams({ naceCode })
        if (countryCode) {
          lookupParams.set('country_code', countryCode.toUpperCase())
        }
        if (guaranteeResolution) {
          lookupParams.set('guarantee_resolution', guaranteeResolution)
        }
        if (guarantee) {
          lookupParams.set('guarantee', guarantee)
        }
        url = `${titanUrl}/api/v2/nace/codes/${encodeURIComponent(naceCode)}/business-type?${lookupParams}`
      } else if (businessTypeId) {
        url = `${titanUrl}/api/v2/business-types/${businessTypeId}/nace`
      } else if (q && q.length >= 1) {
        const params = new URLSearchParams({ q, limit })
        url = `${titanUrl}/api/v2/nace/search?${params}`
      } else {
        clearTimeout(timeout)
        return NextResponse.json({ success: true, data: [] })
      }

      const { cookieHeader } = await getBffCookieHeaderForTitan(request)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        console.error('[Venus NACE API] Backend error:', { status: response.status, url })
        return NextResponse.json(
          { success: false, data: [], error: `Backend error: ${response.status}` },
          { status: response.status }
        )
      }

      const data = await response.json().catch(() => ({ success: false }))
      const cacheHeader = naceCode
        ? 'private, no-cache'
        : 'public, s-maxage=600, stale-while-revalidate=1200'
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': cacheHeader,
        },
      })
    } catch (fetchError) {
      clearTimeout(timeout)
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError'
      console.error('[Venus NACE API] Connection error:', {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        isTimeout,
      })
      return NextResponse.json(
        {
          success: false,
          data: [],
          error: isTimeout ? 'Request timed out' : 'Service unavailable',
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('[Venus NACE API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, data: [], error: 'Failed to search NACE codes' },
      { status: 500 }
    )
  }
}
