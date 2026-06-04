import { NextRequest, NextResponse } from 'next/server'
import { hasTitanAccessCookie } from '@/utils/auth/cookieHeader'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function upstreamMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const message = (data as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('timeout')
}

function unauthorized() {
  return NextResponse.json({ message: 'Authentication required' }, { status: 401 })
}

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    if (!hasTitanAccessCookie(cookieHeader)) return unauthorized()

    const redirectUri = request.nextUrl.searchParams.get('redirect_uri') || ''
    const state = request.nextUrl.searchParams.get('state')
    const titanApiUrl = getTitanApiUrl(request)
    const upstream = new URLSearchParams({ redirect_uri: redirectUri })
    if (state) {
      upstream.set('state', state)
    }
    const targetUrl = `${titanApiUrl}/integrations/accounting/silverfin/authorize?${upstream.toString()}`

    const { response, json: data } = await fetchJsonWithTimeout(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      },
      15_000
    )

    if (!response.ok) {
      return NextResponse.json(
        {
          message: upstreamMessage(data, 'Failed to get Silverfin authorize URL'),
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Venus Silverfin authorize route]', error)
    return NextResponse.json(
      { message: isTimeoutError(error) ? 'Request timed out' : 'Silverfin service unavailable' },
      { status: isTimeoutError(error) ? 504 : 502 }
    )
  }
}
