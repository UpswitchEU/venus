/**
 * AI History API Route
 *
 * Proxies conversation history requests to Titan.
 * GET /api/ai/history?reportId=xxx
 *
 * For accountant-in-client-view: forwards client context headers to Titan.
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
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const reportId = request.nextUrl.searchParams.get('reportId')
    if (!reportId) {
      return NextResponse.json({ success: false, error: 'reportId is required' }, { status: 400 })
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return NextResponse.json(
        { success: true, conversationId: null, messages: [] },
        { status: 200 }
      )
    }

    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)

    const titanResponse = await fetchWithTimeout(
      `${getTitanApiUrl(request)}/api/v2/ai/conversations/${encodeURIComponent(reportId)}/history`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
          ...(cookieHeader && { Cookie: cookieHeader }),
          ...getTitanClientContextHeaders(request),
        },
      },
      10_000
    )

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: true, conversationId: null, messages: [] },
        { status: 200 }
      )
    }

    const data = await titanResponse.json().catch(() => ({ success: false, messages: [] }))
    return NextResponse.json(data)
  } catch (error) {
    apiLogger.error(
      'AI history proxy failed',
      { route: '/api/ai/history' },
      error instanceof Error ? error : undefined
    )
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      { success: true, conversationId: null, messages: [] },
      { status: isTimeout ? 504 : 200 }
    )
  }
}
