/**
 * BFF tests for POST /api/ai/chat (responses).
 *
 * Covers Titan error pass-through, SSE recovery, response shape, and network failures.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_CHAT_PROXY_TIMEOUT_MS,
  getAiChatRouteMocks,
  POST,
  request,
  resetAiChatRouteHarness,
  restoreAiChatRouteHarness,
  titanEmptyStreamResponse,
  titanJsonResponse,
  titanKeepaliveOnlyStreamResponse,
} from './route.testHarness'

beforeEach(resetAiChatRouteHarness)

afterEach(restoreAiChatRouteHarness)

describe('error pass-through', () => {
  it('forwards Titan 402 with fallback:true for upsell rendering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        titanJsonResponse(402, {
          message: 'AI chat credit limit reached.',
          requires_upgrade: true,
          ai_credits_remaining: 0,
          ai_credits_limit: 20,
        })
      )
    )

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(res.status).toBe(402)
    expect(body).toMatchObject({
      success: false,
      fallback: true,
      error: 'AI chat credit limit reached.',
      requires_upgrade: true,
      ai_credits_remaining: 0,
      ai_credits_limit: 20,
    })
  })

  it('preserves Titan 412 consent metadata so the client can open the consent modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        titanJsonResponse(412, {
          code: 'AI_CONSENT_REQUIRED',
          message: 'AI processing consent is required.',
          currentPolicyVersion: 'ai-chat-v2',
          hasHistoricConsent: false,
        })
      )
    )

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(res.status).toBe(412)
    expect(body).toMatchObject({
      success: false,
      fallback: true,
      error: 'AI processing consent is required.',
      code: 'AI_CONSENT_REQUIRED',
      currentPolicyVersion: 'ai-chat-v2',
      hasHistoricConsent: false,
    })
  })

  it('falls back to generic message when Titan non-OK has no `message` field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(titanJsonResponse(500, { code: 'internal' })))

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('AI service unavailable')
  })

  it('handles non-JSON Titan body gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('garbage', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    )

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toBe('AI service unavailable')
  })
})

describe('response shape', () => {
  it('returns the raw Titan SSE body with text/event-stream headers', async () => {
    const res = await POST(request({ message: 'hi' }))

    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    expect(res.headers.get('Connection')).toBe('keep-alive')
    // Vercel/nginx will buffer SSE without this — turns short streams
    // into a wall of silence that flushes only on close. Mirrors the
    // sibling Mercury BFF route pins; do not quietly drop it.
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
  })

  it('retries non-streaming chat and synthesizes SSE when upstream stream body is empty', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(titanEmptyStreamResponse())
      .mockResolvedValueOnce(
        titanJsonResponse(200, {
          success: true,
          conversationId: 'conv-fallback',
          content: 'Welk bedrijf wil je toevoegen?',
          aiCredits: { remaining: 41, limit: 100 },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(request({ message: 'Voeg een nieuwe klant toe' }))
    const text = await res.text()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v2/ai/stream')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/v2/ai/chat')
    const fallbackInit = fetchMock.mock.calls[1]?.[1] as
      | { headers?: Record<string, string>; body?: string }
      | undefined
    expect(fallbackInit?.headers?.Accept).toBe('application/json')
    expect(fallbackInit?.headers?.['X-Ai-Stream-Recovery']).toBe('1')
    expect(JSON.parse(fallbackInit?.body ?? '{}')).not.toHaveProperty('recoverFromStreamTurn')
    expect(text).toContain('Welk bedrijf wil je toevoegen?')
    expect(text).toContain('"type":"stream_recovery"')
    expect(getAiChatRouteMocks().apiLogger.warn).toHaveBeenCalledWith(
      '[ai.chat] recovered empty SSE via non-streaming chat',
      expect.objectContaining({ route: '/api/ai/chat' })
    )
  })

  it('preserves valuation report context when BFF stream fallback retries non-streaming chat', async () => {
    const valuationReportId = '48d52144-1fa9-44e7-b077-8dc22310c2ac'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(titanEmptyStreamResponse())
      .mockResolvedValueOnce(
        titanJsonResponse(200, {
          success: true,
          conversationId: 'conv-fallback',
          content: 'De waardering bedraagt €560K.',
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(
      request({
        message: 'Leg de waarde uit',
        sessionId: 'client_client-123',
        reportId: valuationReportId,
        companyName: 'Bakkerij Klaas',
        formData: { revenue: 1000000, ebitda: 100000, industry: 'bakery' },
        normalizations: [{ category: 'owner_salary', status: 'accepted' }],
        audience: 'advisor',
        assistantIntent: 'explain_value',
      })
    )
    const text = await res.text()

    expect(text).toContain('De waardering bedraagt €560K.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const fallbackInit = fetchMock.mock.calls[1]?.[1] as
      | { headers?: Record<string, string>; body?: string }
      | undefined
    const fallbackBody = JSON.parse(fallbackInit?.body ?? '{}')
    expect(fallbackInit?.headers?.['X-Ai-Stream-Recovery']).toBe('1')
    expect(fallbackBody.context).toMatchObject({
      sessionId: 'client_client-123',
      reportId: valuationReportId,
      companyName: 'Bakkerij Klaas',
      assistantIntent: 'explain_value',
      industry: 'bakery',
    })
    expect(fallbackBody.formData).toMatchObject({ revenue: 1000000, ebitda: 100000 })
    expect(fallbackBody.normalizations).toEqual([{ category: 'owner_salary', status: 'accepted' }])
    expect(fallbackBody.audience).toBe('advisor')
  })

  it('retries non-streaming chat when upstream SSE only contained keepalive frames', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(titanKeepaliveOnlyStreamResponse())
      .mockResolvedValueOnce(
        titanJsonResponse(200, {
          success: true,
          content: 'Recovered after keepalive-only stream',
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(request({ message: 'Voeg bakker klaas toe' }))
    const text = await res.text()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text).toContain('Recovered after keepalive-only stream')
    expect(getAiChatRouteMocks().apiLogger.warn).toHaveBeenCalledWith(
      '[ai.chat] upstream SSE had no visible content',
      expect.objectContaining({ noVisibleContent: true })
    )
  })

  it('logs fallback status when non-streaming chat returns 499', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(titanEmptyStreamResponse())
      .mockResolvedValueOnce(titanJsonResponse(499, {}))
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(request({ message: 'Leg de waarde uit' }))
    const text = await res.text()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text).toContain('AI stream fallback failed')
    expect(getAiChatRouteMocks().apiLogger.warn).toHaveBeenCalledWith(
      '[ai.chat] empty SSE non-streaming fallback failed',
      expect.objectContaining({ fallbackStatus: 499, streamRecovery: 'bff-fallback-failed' })
    )
    expect(getAiChatRouteMocks().apiLogger.warn).toHaveBeenCalledWith(
      '[ai.chat] emitted terminal error SSE for client recovery',
      expect.objectContaining({ streamRecovery: 'error-sse-emitted' })
    )
  })

  it('returns NextResponse.json for non-streaming success', async () => {
    const payload = {
      success: true,
      content: 'Hello world',
      conversationId: 'conv-xyz',
      usage: { inputTokens: 5, outputTokens: 3, estimatedCost: 0.0005 },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(titanJsonResponse(200, payload)))

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(body).toEqual(payload)
  })
})

describe('network failures', () => {
  it('returns 504 with AI request timed out on AbortError', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(res.status).toBe(504)
    expect(body).toMatchObject({
      success: false,
      code: 'AI_BACKEND_TIMEOUT',
      error: 'AI request timed out',
      fallback: true,
    })
  })

  it('returns 503 with generic connect error on any other thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const res = await POST(request({ message: 'hi', stream: false }))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body).toMatchObject({
      success: false,
      code: 'AI_BACKEND_UNREACHABLE',
      error: 'Failed to connect to AI service',
      fallback: true,
    })
  })

  it('returns an actionable local Titan recovery hint on localhost network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const res = await POST(
      request({ message: 'hi', stream: false }, {}, 'http://localhost:3001/api/ai/chat')
    )
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body).toMatchObject({
      success: false,
      code: 'AI_BACKEND_UNREACHABLE',
      error:
        'AI backend is not reachable at http://localhost:3002. Start Titan locally and make sure apps/titan-api/.env contains the required auth variables from .env.example.',
      recovery: 'Run `pnpm start:dev` in apps/titan-api, then retry the assistant.',
      fallback: true,
    })
  })
})
