import { NextRequest, NextResponse } from 'next/server'
import { getTitanAccessTokenFromCookieHeader } from '@/utils/auth/cookieHeader'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TITAN_API_URL = (() => {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'NEXT_PUBLIC_BACKEND_URL or NEXT_PUBLIC_API_BASE_URL must be set in production'
      )
    }
    return 'http://localhost:3002'
  }
  return url
})()

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

    const response = await fetch(`${TITAN_API_URL}/api/v2/valuations/calculate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => ({
      error: 'Failed to parse response',
      code: 'PARSE_ERROR',
    }))

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'An unexpected error occurred',
      },
      { status: 500 }
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
