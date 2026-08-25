import { NextRequest, NextResponse } from 'next/server'
import { getTitanAccessTokenFromCookieHeader } from '@/utils/auth/cookieHeader'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const VALUATION_CALC_TIMEOUT_MS = 60_000

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AuthUpstreamTimeoutError' || error.message.includes('timeout'))
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getTitanClientContextHeaders(request),
    }

    const cookie = request.headers.get('cookie')
    if (cookie) {
      headers.Cookie = cookie
      if (!request.headers.get('authorization')) {
        const accessToken = getTitanAccessTokenFromCookieHeader(cookie)
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`
        }
      }
    }

    const auth = request.headers.get('authorization')
    if (auth) headers.Authorization = auth

    const { response, json } = await fetchJsonWithTimeout(
      `${getTitanApiUrl(request)}/api/v2/valuations/calculate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
      VALUATION_CALC_TIMEOUT_MS
    )

    const data = json ?? {
      error: 'Failed to parse response',
      code: 'PARSE_ERROR',
    }

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    if (isTimeoutError(error)) {
      return NextResponse.json(
        {
          error: 'Valuation calculation timed out',
          code: 'UPSTREAM_TIMEOUT',
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        error: 'Valuation calculation service unavailable',
        code: 'UPSTREAM_UNAVAILABLE',
        message:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'An unexpected error occurred',
      },
      { status: 502 }
    )
  }
}

/**
 * GET /api/valuation/calculate-unified
 *
 * This endpoint only accepts POST requests.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
      message: 'This endpoint only accepts POST requests',
    },
    {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    }
  )
}
