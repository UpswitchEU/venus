/**
 * Venus BFF for AI processing consent.
 *
 * Proxies Titan's `/api/v2/ai/consent` endpoint behind a same-origin route so
 * the chat drawer can recover from `412 AI_CONSENT_REQUIRED` without exposing
 * Titan directly to the browser.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { apiLogger } from '@/utils/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const TIMEOUT_MS = 5_000
const TITAN_PATH = '/api/v2/ai/consent'

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    },
    { status: 401 }
  )
}

function buildHeaders(args: {
  accessToken: string | null
  cookieHeader: string
  request: NextRequest
}): Record<string, string> {
  const xForwardedFor = args.request.headers.get('x-forwarded-for')
  const userAgent = args.request.headers.get('user-agent')

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(args.accessToken ? { Authorization: `Bearer ${args.accessToken}` } : {}),
    ...(args.cookieHeader ? { Cookie: args.cookieHeader } : {}),
    ...(xForwardedFor ? { 'X-Forwarded-For': xForwardedFor } : {}),
    ...(userAgent ? { 'User-Agent': userAgent } : {}),
  }
}

async function getAuthContext(request: NextRequest): Promise<{
  cookieHeader: string
  accessToken: string | null
} | null> {
  const { cookieHeader } = await getBffCookieHeaderForTitan(request)
  if (!hasTitanAccessCookie(cookieHeader)) return null
  return {
    cookieHeader,
    accessToken: getTitanAccessTokenFromCookieHeader(cookieHeader),
  }
}

async function proxyConsentRequest(
  request: NextRequest,
  init: Pick<RequestInit, 'method' | 'body'>
): Promise<NextResponse> {
  try {
    const authContext = await getAuthContext(request)
    if (!authContext) return unauthorized()

    const titanResponse = await fetchWithTimeout(
      `${getTitanApiUrl(request)}${TITAN_PATH}`,
      {
        method: init.method,
        headers: buildHeaders({
          accessToken: authContext.accessToken,
          cookieHeader: authContext.cookieHeader,
          request,
        }),
        credentials: 'include',
        ...(init.body ? { body: init.body } : {}),
      },
      TIMEOUT_MS
    )

    const data = await titanResponse.json().catch(() => ({}))
    return NextResponse.json(data, { status: titanResponse.status })
  } catch (error) {
    apiLogger.error(
      'AI consent proxy failed',
      { route: '/api/profile/ai-consent' },
      error instanceof Error ? error : undefined
    )
    return NextResponse.json(
      {
        success: false,
        code: 'CONSENT_SERVICE_UNAVAILABLE',
        message: 'Consent service unreachable',
      },
      { status: 503 }
    )
  }
}

export async function GET(request: NextRequest) {
  return proxyConsentRequest(request, { method: 'GET' })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return proxyConsentRequest(request, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function DELETE(request: NextRequest) {
  return proxyConsentRequest(request, { method: 'DELETE' })
}
