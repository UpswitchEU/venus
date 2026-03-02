/**
 * AI Chat API Route
 *
 * Proxies chat requests to Titan's Claude-powered AI endpoint.
 * Supports both streaming (SSE) and non-streaming (JSON) modes.
 * Conversation history is managed server-side by Titan.
 *
 * Titan endpoints:
 * - POST /api/v2/ai/stream (SSE streaming with tool events)
 * - POST /api/v2/ai/chat (JSON fallback)
 */

import { NextRequest, NextResponse } from 'next/server'

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 60_000

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

    const messages = [
      ...(body.history || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user' as const, content: body.message },
    ]

    const context = {
      sessionId: body.sessionId || '',
      companyName: body.companyName,
      industry: body.formData?.industry,
      countryCode: body.formData?.country_code || body.formData?.country,
      focusedField: body.fieldContext?.field,
      reportId: body.reportId || body.sessionId,
      hasRevenue: !!body.formData?.revenue,
      hasEbitda: !!body.formData?.ebitda,
      hasOwnerSalary: !!body.normalizations?.some((n: any) => n.category === 'salary'),
      needsNormalization: !!body.normalizations?.some((n: any) => n.status === 'pending'),
    }

    const titanPayload: any = { messages, context }
    if (body.conversationId) {
      titanPayload.conversationId = body.conversationId
    }
    if (body.formData) {
      titanPayload.formData = body.formData
    }
    if (body.normalizations) {
      titanPayload.normalizations = body.normalizations
    }

    const titanResponse = await fetch(titanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: useStream ? 'text/event-stream' : 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
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
