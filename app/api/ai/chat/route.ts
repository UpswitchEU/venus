/**
 * AI Chat API Route
 *
 * Proxies chat requests to Titan's Claude-powered AI endpoint.
 * Supports both streaming (SSE) and non-streaming (JSON) modes.
 * Conversation history is managed server-side by Titan.
 *
 * For accountant-in-client-view: forwards X-Client-User-Id, X-Accountant-User-Id,
 * X-Relationship-Id so Titan can resolve session/report for the client.
 *
 * Titan endpoints:
 * - POST /api/v2/ai/stream (SSE streaming with tool events)
 * - POST /api/v2/ai/chat (JSON fallback)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { apiLogger } from '@/utils/logger'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'
import {
  buildTitanAiChatProxyPlan,
  buildTitanErrorEnvelope,
  buildTitanNetworkErrorEnvelope,
} from './chat-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TIMEOUT_MS = 60_000

export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body', fallback: true },
        { status: 400 }
      )
    }

    const planResult = buildTitanAiChatProxyPlan(body)
    if (planResult.ok === false) {
      return NextResponse.json(planResult.body, { status: planResult.status })
    }
    const { plan } = planResult

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', fallback: true },
        { status: 401 }
      )
    }

    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)

    const titanApiUrl = getTitanApiUrl(request)
    const titanEndpoint = plan.useStream
      ? `${titanApiUrl}/api/v2/ai/stream`
      : `${titanApiUrl}/api/v2/ai/chat`

    const clientContextHeaders = getTitanClientContextHeaders(request)

    const titanResponse = await fetch(titanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: plan.useStream ? 'text/event-stream' : 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...clientContextHeaders,
      },
      body: JSON.stringify(plan.payload),
      signal: controller.signal,
    })

    if (!titanResponse.ok) {
      const errorData = await titanResponse.json().catch(() => ({}))
      return NextResponse.json(buildTitanErrorEnvelope(errorData), { status: titanResponse.status })
    }

    if (plan.useStream && titanResponse.body) {
      return new Response(titanResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }

    const data = await titanResponse.json()
    return NextResponse.json(data)
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    const titanApiUrl = getTitanApiUrl(request)
    if (isTimeout) {
      return NextResponse.json(buildTitanNetworkErrorEnvelope({ isTimeout, titanApiUrl }), {
        status: 504,
      })
    }
    apiLogger.error(
      'AI chat proxy failed',
      { route: '/api/ai/chat' },
      error instanceof Error ? error : undefined
    )
    return NextResponse.json(buildTitanNetworkErrorEnvelope({ isTimeout, titanApiUrl }), {
      status: 503,
    })
  } finally {
    clearTimeout(timeout)
  }
}
