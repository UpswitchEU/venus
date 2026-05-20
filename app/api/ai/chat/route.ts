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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TIMEOUT_MS = 60_000

interface ChatHistoryItem {
  role: string
  content: string
}

interface NormalizationItem {
  category?: string
  status?: string
}

function resolveAudience(raw: unknown): 'advisor' | 'owner' {
  return raw === 'advisor' || raw === 'owner' ? raw : 'owner'
}

function getStringField(obj: Record<string, unknown>, key: string): string | null {
  const raw = obj[key]
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

function buildTitanErrorEnvelope(errorData: unknown): Record<string, unknown> {
  const errorObject =
    errorData && typeof errorData === 'object' && !Array.isArray(errorData)
      ? (errorData as Record<string, unknown>)
      : {}
  const errorMessage =
    getStringField(errorObject, 'message') ||
    getStringField(errorObject, 'error') ||
    'AI service unavailable'

  return {
    ...errorObject,
    success: false,
    error: errorMessage,
    fallback: true,
  }
}

export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = await request.json()

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', fallback: true },
        { status: 401 }
      )
    }

    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)

    const useStream = body.stream !== false

    const titanApiUrl = getTitanApiUrl(request)
    const titanEndpoint = useStream
      ? `${titanApiUrl}/api/v2/ai/stream`
      : `${titanApiUrl}/api/v2/ai/chat`

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
      locale:
        typeof body.locale === 'string' && body.locale.length > 0
          ? body.locale.slice(0, 8)
          : undefined,
      focusedField: body.fieldContext?.field,
      reportId: body.reportId || body.sessionId,
      hasRevenue: !!body.formData?.revenue,
      hasEbitda: !!body.formData?.ebitda,
      hasOwnerSalary: !!norms.some((n) => n.category === 'salary'),
      needsNormalization: !!norms.some((n) => n.status === 'pending'),
    }

    const titanPayload: Record<string, unknown> = {
      messages,
      context,
      audience: resolveAudience(body.audience),
    }
    if (body.conversationId) {
      titanPayload.conversationId = body.conversationId
    }
    if (body.formData) {
      titanPayload.formData = body.formData
    }
    if (body.normalizations) {
      titanPayload.normalizations = body.normalizations
    }

    const clientContextHeaders = getTitanClientContextHeaders(request)

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
      return NextResponse.json(buildTitanErrorEnvelope(errorData), { status: titanResponse.status })
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
    apiLogger.error(
      'AI chat proxy failed',
      { route: '/api/ai/chat' },
      error instanceof Error ? error : undefined
    )
    return NextResponse.json(
      { success: false, error: 'Failed to connect to AI service', fallback: true },
      { status: 503 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
