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
import { CLIENT_CONTEXT_HEADERS, LEGACY_CLIENT_CONTEXT_HEADERS } from '@/constants/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 60_000

interface ChatHistoryItem {
  role: string
  content: string
}

interface NormalizationItem {
  category?: string
  status?: string
}

export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = await request.json()

    const cookieHeader = request.headers.get('cookie') || ''
    const hasAuth = cookieHeader.includes('upswitch_access_token=')

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', fallback: true },
        { status: 401 }
      )
    }

    const accessTokenMatch = cookieHeader.match(/upswitch_access_token=([^;]+)/)
    const accessToken = accessTokenMatch?.[1]?.trim()

    const useStream = body.stream !== false

    const titanEndpoint = useStream
      ? `${TITAN_API_URL}/api/v2/ai/stream`
      : `${TITAN_API_URL}/api/v2/ai/chat`

    const historyRaw = Array.isArray(body.history) ? body.history : []
    const messages = [
      ...historyRaw.map((msg: ChatHistoryItem) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user' as const, content: body.message },
    ]

    const norms: NormalizationItem[] = Array.isArray(body.normalizations)
      ? (body.normalizations as NormalizationItem[])
      : []

    const context = {
      sessionId: body.sessionId || '',
      companyName: body.companyName,
      industry: body.formData?.industry,
      countryCode: body.formData?.country_code || body.formData?.country,
      focusedField: body.fieldContext?.field,
      reportId: body.reportId || body.sessionId,
      hasRevenue: !!body.formData?.revenue,
      hasEbitda: !!body.formData?.ebitda,
      hasOwnerSalary: !!norms.some((n) => n.category === 'salary'),
      needsNormalization: !!norms.some((n) => n.status === 'pending'),
    }

    const titanPayload: Record<string, unknown> = { messages, context }
    if (body.conversationId) {
      titanPayload.conversationId = body.conversationId
    }
    if (body.formData) {
      titanPayload.formData = body.formData
    }
    if (body.normalizations) {
      titanPayload.normalizations = body.normalizations
    }

    const clientContextHeaders = getClientContextHeadersForTitan(request)

    const titanResponse = await fetch(titanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: useStream ? 'text/event-stream' : 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...clientContextHeaders,
      },
      body: JSON.stringify(titanPayload),
      signal: controller.signal,
    })

    if (!titanResponse.ok) {
      const errorData = await titanResponse.json().catch(() => ({}))
      return NextResponse.json(
        {
          success: false,
          error: errorData.message || 'AI service unavailable',
          fallback: true,
        },
        { status: titanResponse.status }
      )
    }

    if (useStream && titanResponse.body) {
      return new Response(titanResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    const data = await titanResponse.json()
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'AI request timed out', fallback: true },
        { status: 504 }
      )
    }
    console.error('[AI Chat Route] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { success: false, error: 'Failed to connect to AI service', fallback: true },
      { status: 503 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
