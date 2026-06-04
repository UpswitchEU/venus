import { NextRequest, NextResponse } from 'next/server'

import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const AGENT_TOOL_ACTION_NAME_HEADER = 'X-Upswitch-Agent-Tool-Name'
const AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER = 'X-Upswitch-Agent-Proposal-Id'

function unauthorized() {
  return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
}

function forwardAgentToolActionHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of [AGENT_TOOL_ACTION_NAME_HEADER, AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER]) {
    const value = request.headers.get(name)
    if (value?.trim()) headers[name] = value.trim()
  }
  return headers
}

async function getTitanAuth(request: NextRequest) {
  const { cookieHeader } = await getBffCookieHeaderForTitan(request)
  if (!hasTitanAccessCookie(cookieHeader)) return null
  return {
    cookieHeader,
    accessToken: getTitanAccessTokenFromCookieHeader(cookieHeader),
  }
}

function titanError(data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    const message = (data as Record<string, unknown>).message
    const error = (data as Record<string, unknown>).error
    if (typeof message === 'string' && message.trim()) return message
    if (typeof error === 'string' && error.trim()) return error
  }
  return fallback
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getTitanAuth(request)
    if (!auth) return unauthorized()

    const target = new URL(`${getTitanApiUrl(request)}/api/v2/owner-profile-assessment`)
    const accountantCustomerId = request.nextUrl.searchParams.get('accountantCustomerId')
    if (accountantCustomerId) target.searchParams.set('accountantCustomerId', accountantCustomerId)

    const { response, json: data } = await fetchJsonWithTimeout(
      target.toString(),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(auth.accessToken && { Authorization: `Bearer ${auth.accessToken}` }),
          ...(auth.cookieHeader && { Cookie: auth.cookieHeader }),
          ...getTitanClientContextHeaders(request),
        },
      },
      10_000
    )

    if (response.status === 401) return unauthorized()
    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: titanError(data, 'Failed to fetch owner profile assessment'),
        },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      {
        success: false,
        message: isTimeout
          ? 'Request timed out. Please try again.'
          : 'An unexpected error occurred',
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getTitanAuth(request)
    if (!auth) return unauthorized()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
    }

    const { response, json: data } = await fetchJsonWithTimeout(
      `${getTitanApiUrl(request)}/api/v2/owner-profile-assessment`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(auth.accessToken && { Authorization: `Bearer ${auth.accessToken}` }),
          ...(auth.cookieHeader && { Cookie: auth.cookieHeader }),
          ...getTitanClientContextHeaders(request),
          ...forwardAgentToolActionHeaders(request),
        },
        body: JSON.stringify(body),
      },
      15_000
    )

    if (response.status === 401) return unauthorized()
    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: titanError(data, 'Failed to upsert owner profile assessment'),
        },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message:
        'complete' in body && body.complete === true
          ? 'Owner profile assessment submitted'
          : 'Owner profile assessment saved',
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      {
        success: false,
        message: isTimeout
          ? 'Request timed out. Please try again.'
          : 'An unexpected error occurred',
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
