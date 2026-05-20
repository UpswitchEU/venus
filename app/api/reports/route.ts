/**
 * Reports Route - Venus
 *
 * Proxies report-list requests to Titan API.
 *
 * Report lists are user-scoped data. Keep this route private and always
 * revalidate with Titan instead of sharing a process-wide cache across users.
 */

import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_CONTEXT_HEADERS, extractClientContextFromHeaders } from '@/constants/headers'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { PRIVATE_BFF_JSON_HEADERS } from '@/utils/bffResponseHeaders'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

// Force dynamic rendering - this route uses cookies(), headers(), and searchParams which are dynamic
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const REPORTS_FETCH_TIMEOUT_MS = 10_000

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function buildReportsQuery(params: { skip: number; take: number; status: string }): string {
  return new URLSearchParams({
    skip: String(params.skip),
    take: String(params.take),
    status: params.status,
  }).toString()
}

function buildTitanHeaders(request: NextRequest, cookieHeader: string): Record<string, string> {
  const titanHeaders: Record<string, string> = {}

  if (cookieHeader) {
    titanHeaders.Cookie = cookieHeader
  }

  const guestSessionId = request.headers.get('x-guest-session-id')
  if (guestSessionId) {
    titanHeaders['x-guest-session-id'] = guestSessionId
  }

  const clientContext = extractClientContextFromHeaders((name: string) => request.headers.get(name))
  if (clientContext) {
    if (clientContext.clientUserId) {
      titanHeaders[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientContext.clientUserId
    }
    titanHeaders[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = clientContext.accountantUserId
    if (clientContext.relationshipId) {
      titanHeaders[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = clientContext.relationshipId
    }
  }

  return titanHeaders
}

export async function GET(request: NextRequest) {
  try {
    const titanApiUrl = getTitanApiUrl(request)

    // Get query parameters with defaults
    const searchParams = request.nextUrl.searchParams
    const limit = parseBoundedInteger(searchParams.get('limit'), 20, 1, 100)
    const offset = parseBoundedInteger(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER)
    const status = searchParams.get('status') || 'all'

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const titanHeaders = buildTitanHeaders(request, cookieHeader)
    const titanQuery = buildReportsQuery({ skip: offset, take: limit, status })

    const response = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/valuations/reports?${titanQuery}`,
      {
        method: 'GET',
        headers: titanHeaders,
      },
      REPORTS_FETCH_TIMEOUT_MS
    )

    if (!response.ok) {
      console.error('[Venus /api/reports] Titan response not OK:', {
        status: response.status,
        statusText: response.statusText,
      })
      return NextResponse.json({ error: 'Failed to fetch reports' }, { status: response.status })
    }

    const data = await response.json().catch(() => ({ success: false }))

    return NextResponse.json(data, {
      headers: PRIVATE_BFF_JSON_HEADERS,
    })
  } catch (error) {
    console.error('[Venus /api/reports] Error:', error)
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out' : 'Internal server error' },
      { status: isTimeout ? 504 : 500, headers: PRIVATE_BFF_JSON_HEADERS }
    )
  }
}
