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
  AI_CHAT_PROXY_TIMEOUT_MS,
  buildTitanAiChatProxyPlan,
  buildTitanErrorEnvelope,
  buildTitanNetworkErrorEnvelope,
  fetchWithTimeout,
  getOrCreateCorrelationId,
  getTitanResponseCorrelationId,
  isTitanAiProxyTimeoutError,
} from './chat-proxy'
import { wrapAiSseBodyForObservability } from './ai-stream-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request)
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      const response = NextResponse.json(
        { success: false, error: 'Invalid JSON body', fallback: true },
        { status: 400 }
      )
      response.headers.set('X-Correlation-ID', correlationId)
      return response
    }

    const planResult = buildTitanAiChatProxyPlan(body)
    if (planResult.ok === false) {
      const response = NextResponse.json(planResult.body, { status: planResult.status })
      response.headers.set('X-Correlation-ID', correlationId)
      return response
    }
    const { plan } = planResult

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      const response = NextResponse.json(
        { success: false, error: 'Authentication required', fallback: true },
        { status: 401 }
      )
      response.headers.set('X-Correlation-ID', correlationId)
      return response
    }

    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)

    const titanApiUrl = getTitanApiUrl(request)
    const titanStreamEndpoint = `${titanApiUrl}/api/v2/ai/stream`
    const titanChatEndpoint = `${titanApiUrl}/api/v2/ai/chat`

    const clientContextHeaders = getTitanClientContextHeaders(request)
    const streamHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: plan.useStream ? 'text/event-stream' : 'application/json',
      'X-Correlation-ID': correlationId,
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...(cookieHeader && { Cookie: cookieHeader }),
      ...clientContextHeaders,
    }
    const chatHeaders = plan.useStream
      ? { ...streamHeaders, Accept: 'application/json' }
      : streamHeaders

    const titanResponse = await fetchWithTimeout(
      plan.useStream ? titanStreamEndpoint : titanChatEndpoint,
      {
        method: 'POST',
        headers: streamHeaders,
        body: JSON.stringify(plan.payload),
      },
      AI_CHAT_PROXY_TIMEOUT_MS
    )

    if (!titanResponse.ok) {
      const errorData = await titanResponse.json().catch(() => ({}))
      const response = NextResponse.json(buildTitanErrorEnvelope(errorData), {
        status: titanResponse.status,
      })
      response.headers.set(
        'X-Correlation-ID',
        getTitanResponseCorrelationId(titanResponse, correlationId)
      )
      return response
    }

    if (plan.useStream && titanResponse.body) {
      const responseCorrelationId = getTitanResponseCorrelationId(titanResponse, correlationId)
      const nonStreamingPayload = { ...plan.payload }
      const wrapped = wrapAiSseBodyForObservability(titanResponse.body, {
        correlationId: responseCorrelationId,
        upstreamStatus: titanResponse.status,
        fetchNonStreamingFallback: () =>
          fetchWithTimeout(
            titanChatEndpoint,
            {
              method: 'POST',
              headers: chatHeaders,
              body: JSON.stringify(nonStreamingPayload),
            },
            AI_CHAT_PROXY_TIMEOUT_MS
          ),
      })
      return new Response(wrapped, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Correlation-ID': responseCorrelationId,
          // Vercel/nginx will buffer SSE without this — turns short turns
          // into a wall of silence flushed only on close, which the FE
          // (Venus + Mercury both) reads as an empty stream. Sibling
          // routes in apps/mercury/app/api/ai/chat + onboarding/stream
          // pin this same header; do not drop it.
          'X-Accel-Buffering': 'no',
        },
      })
    }

    const data = await titanResponse.json()
    const response = NextResponse.json(data)
    response.headers.set(
      'X-Correlation-ID',
      getTitanResponseCorrelationId(titanResponse, correlationId)
    )
    return response
  } catch (error) {
    const isTimeout = isTitanAiProxyTimeoutError(error)
    const titanApiUrl = getTitanApiUrl(request)
    if (isTimeout) {
      const response = NextResponse.json(buildTitanNetworkErrorEnvelope({ isTimeout, titanApiUrl }), {
        status: 504,
      })
      response.headers.set('X-Correlation-ID', correlationId)
      return response
    }
    apiLogger.error(
      'AI chat proxy failed',
      { route: '/api/ai/chat', correlationId },
      error instanceof Error ? error : undefined
    )
    const response = NextResponse.json(buildTitanNetworkErrorEnvelope({ isTimeout, titanApiUrl }), {
      status: 503,
    })
    response.headers.set('X-Correlation-ID', correlationId)
    return response
  }
}
