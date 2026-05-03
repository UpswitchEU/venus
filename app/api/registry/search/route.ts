/**
 * Registry Search API Proxy Route (Venus)
 *
 * Proxies KBO (Belgian Company Registry) search requests to the Titan backend API.
 * Uses canonical /api/v2/registry/search (same as Mercury), with v1 fallback on 404.
 *
 * Venus `REGISTRY_SEARCH_PROXY_TIMEOUT_MS` is kept equal to Mercury
 * `REGISTRY_PROXY_TOTAL_BUDGET_MS` (14.5s) — strictly below the 15s browser
 * `REGISTRY_SEARCH_CLIENT_TIMEOUT_MS`. Forwards `request.signal` so client
 * disconnect cancels the Titan round-trip.
 */

import { NextRequest, NextResponse } from 'next/server'
import { REGISTRY_SEARCH_PROXY_TIMEOUT_MS } from '@/services/registry/types'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export async function POST(request: NextRequest) {
  const parentSignal = request.signal

  if (parentSignal.aborted) {
    return NextResponse.json(
      { success: false, results: [], error: 'Client cancelled' },
      { status: 499 }
    )
  }

  try {
    const body = await request.json()

    // Validate required fields (min 2 chars to support short company names e.g. AX, AB)
    if (!body.company_name || body.company_name.length < 2) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          error: 'Company name must be at least 2 characters long',
        },
        { status: 400 }
      )
    }

    const titanUrl = getTitanApiUrl(request)
    const payload = {
      company_name: body.company_name,
      country_code: body.country_code || 'BE',
      limit: body.limit || 10,
    }

    const payloadJson = JSON.stringify(payload)
    const baseFetchInit = {
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: payloadJson,
    }

    const runProxiedFetch = async (path: string): Promise<Response> => {
      const controller = new AbortController()
      let timedOut = false
      let parentAborted = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, REGISTRY_SEARCH_PROXY_TIMEOUT_MS)
      const onParentAbort = () => {
        parentAborted = true
        controller.abort()
      }
      parentSignal.addEventListener('abort', onParentAbort, { once: true })

      try {
        return await fetch(`${titanUrl}${path}`, {
          ...baseFetchInit,
          signal: controller.signal,
        })
      } catch (fetchError) {
        const isAbort = fetchError instanceof Error && fetchError.name === 'AbortError'
        if (isAbort && parentAborted) {
          throw Object.assign(new Error('CLIENT_CANCELLED'), { code: 'CLIENT_CANCELLED' as const })
        }
        const errorMsg = timedOut
          ? `Backend request timed out after ${REGISTRY_SEARCH_PROXY_TIMEOUT_MS / 1000}s`
          : `Cannot reach backend at ${titanUrl}`

        console.error('[Venus Registry API] Connection error:', {
          backendUrl: titanUrl,
          path,
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
          timedOut,
        })

        throw Object.assign(new Error(errorMsg), {
          code: 'UPSTREAM_FETCH' as const,
          status: 503,
        })
      } finally {
        clearTimeout(timer)
        parentSignal.removeEventListener('abort', onParentAbort)
      }
    }

    let backendResponse: Response
    try {
      backendResponse = await runProxiedFetch('/api/v2/registry/search')
    } catch (e) {
      if (
        e instanceof Error &&
        'code' in e &&
        (e as Error & { code?: string }).code === 'CLIENT_CANCELLED'
      ) {
        return NextResponse.json(
          { success: false, results: [], error: 'Client cancelled' },
          { status: 499 }
        )
      }
      if (
        e instanceof Error &&
        'code' in e &&
        (e as Error & { code?: string }).code === 'UPSTREAM_FETCH'
      ) {
        const status = (e as Error & { status?: number }).status ?? 503
        return NextResponse.json({ success: false, results: [], error: e.message }, { status })
      }
      throw e
    }

    // 404 fallback: try v1 endpoint (defensive, same as Mercury)
    if (backendResponse.status === 404) {
      try {
        const fallbackRes = await runProxiedFetch('/api/v1/registry/search')
        if (fallbackRes.ok) {
          const data = await fallbackRes.json()
          return NextResponse.json(data)
        }
      } catch (e) {
        if (
          e instanceof Error &&
          'code' in e &&
          (e as Error & { code?: string }).code === 'CLIENT_CANCELLED'
        ) {
          return NextResponse.json(
            { success: false, results: [], error: 'Client cancelled' },
            { status: 499 }
          )
        }
        // Ignore other fallback errors (parity with previous silent catch)
      }
    }

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error('[Venus Registry API] Backend error:', {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        error: errorText,
      })

      const userMessage =
        backendResponse.status === 503
          ? 'Registry service temporarily unavailable. Please try again later.'
          : `Backend error: ${backendResponse.status} ${backendResponse.statusText}`

      return NextResponse.json(
        { success: false, results: [], error: userMessage },
        { status: backendResponse.status }
      )
    }

    const data = await backendResponse.json().catch(() => ({
      success: false,
      results: [],
      error: 'Invalid response',
    }))
    return NextResponse.json(data)
  } catch (error) {
    console.error('[Venus Registry API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Failed to search companies',
      },
      { status: 500 }
    )
  }
}
