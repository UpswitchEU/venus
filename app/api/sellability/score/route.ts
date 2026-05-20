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
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TIMEOUT_MS = 25_000

export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = await request.json().catch(() => ({}))

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)
    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)

    const titanEndpoint = `${getTitanApiUrl(request)}/api/v2/sellability/score`

    const titanResponse = await fetch(titanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...getTitanClientContextHeaders(request),
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
