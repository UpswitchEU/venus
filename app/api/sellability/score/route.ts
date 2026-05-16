/**
 * Sellability Score API Route
 *
 * Proxies POST to Titan's `/api/v2/sellability/score` so the chat-drawer
 * "Compute now" approve handler can fire the compute without leaving Venus.
 * Mirrors the auth + client-context-header pattern used by the AI chat proxy
 * at `app/api/ai/chat/route.ts`.
 *
 * Body: forwarded as-is. Titan's controller reads Q1/Q2/Q3 from the persisted
 * owner profile when no `questionAnswers` field is present, so callers can
 * POST `{}` to recompute against the saved profile.
 */

import { NextRequest, NextResponse } from 'next/server'
import { CLIENT_CONTEXT_HEADERS, LEGACY_CLIENT_CONTEXT_HEADERS } from '@/constants/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 25_000

function getClientContextHeadersForTitan(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  const clientUserId =
    request.headers.get(CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID) ||
    request.headers.get(LEGACY_CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID)
  const accountantUserId =
    request.headers.get(CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID) ||
    request.headers.get(LEGACY_CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID)
  const relationshipId =
    request.headers.get(CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID) ||
    request.headers.get(LEGACY_CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID)
  if (clientUserId) headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientUserId
  if (accountantUserId) headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = accountantUserId
  if (relationshipId) headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = relationshipId
  return headers
}

export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = await request.json().catch(() => ({}))

    const cookieHeader = request.headers.get('cookie') || ''
    const hasAuth = cookieHeader.includes('upswitch_access_token=')
    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    const accessTokenMatch = cookieHeader.match(/upswitch_access_token=([^;]+)/)
    const accessToken = accessTokenMatch?.[1]?.trim()

    const titanEndpoint = `${TITAN_API_URL}/api/v2/sellability/score`

    const titanResponse = await fetch(titanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...getClientContextHeadersForTitan(request),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const data = await titanResponse.json().catch(() => null)
    if (!titanResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            (data &&
            typeof data === 'object' &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : null) || 'Sellability service unavailable',
        },
        { status: titanResponse.status }
      )
    }
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json(
      {
        success: false,
        error: isAbort
          ? 'Sellability request timed out'
          : err instanceof Error
            ? err.message
            : 'Proxy failed',
      },
      { status: isAbort ? 504 : 500 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
