/**
 * BFF tests for `POST /api/ai/chat` (Venus).
 *
 * Mirrors Mercury's chat BFF test surface but covers Venus-specific
 * implementation details:
 *   - Auth via raw cookie inspection (not Next `cookies()` helper)
 *   - Raw `fetch` with AbortController (not `fetchWithTimeout`)
 *   - Client-context headers — canonical-only on emit (Mercury doubles
 *     up with legacy aliases; Venus stays canonical because every
 *     Venus call originates with the new headers already)
 *
 * Pins:
 *   - Missing `upswitch_access_token` cookie → 401 + fallback:true
 *   - body.stream omitted / true → /api/v2/ai/stream
 *   - body.stream === false → /api/v2/ai/chat
 *   - Bearer (parsed from cookie) + Cookie + client-context headers forwarded
 *   - Both canonical AND legacy client-context inputs map to canonical-only output
 *   - Message concatenation: history + current user message
 *   - Audience scoping: defaults to owner, forwards explicit advisor/owner claim
 *   - Context derives hasRevenue / hasEbitda / hasOwnerSalary / needsNormalization
 *   - Titan non-OK → fallback envelope with err.message
 *   - Streaming response → text/event-stream pass-through
 *   - Non-streaming → JSON pass-through
 *   - AbortError → 504, network error → 503
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

import { POST } from './route'

function request(
  body: unknown,
  headers: Record<string, string> = {},
  url = 'https://valuation.upswitch.app/api/ai/chat'
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      cookie: 'upswitch_access_token=jwt-token-here',
      ...headers,
    },
  })
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function titanStreamResponse(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"text","content":"hi"}\n\n'))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

beforeEach(() => {
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getBffCookieHeaderForTitan.mockImplementation(
    async (requestLike: Pick<Request, 'headers'>) => ({
      cookieHeader: requestLike.headers.get('cookie') || '',
      cookieSource: requestLike.headers.get('cookie') ? 'header' : 'cookieStore',
    })
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(titanStreamResponse()))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------

describe('auth gate', () => {
  it('returns 401 with fallback:true when cookie has no upswitch_access_token', async () => {
    const req = new NextRequest('https://valuation.upswitch.app/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      error: 'Authentication required',
      fallback: true,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 401 when cookie has other tokens but not upswitch_access_token', async () => {
    const res = await POST(
      request(
        { message: 'hi' },
        {
          cookie: 'some_other_cookie=abc; foo=bar',
        }
      )
    )

    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------
// Stream routing
// ---------------------------------------------------------------------

describe('stream routing', () => {
  it('defaults to streaming when body.stream is omitted', async () => {
    await POST(request({ message: 'hi' }))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/stream')
  })

  it('routes to streaming when body.stream === true', async () => {
    await POST(request({ message: 'hi', stream: true }))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/stream')
  })

  it('routes to non-streaming chat when body.stream === false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(titanJsonResponse(200, { success: true, content: 'reply' }))
    )

    await POST(request({ message: 'hi', stream: false }))

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/chat')
    expect((init.headers as Record<string, string>).Accept).toBe('application/json')
  })

  it('uses the local Titan URL for localhost Venus requests when no explicit env is set', async () => {
    await POST(request({ message: 'hi' }, {}, 'http://localhost:3001/api/ai/chat'))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3002/api/v2/ai/stream')
  })
})

// ---------------------------------------------------------------------
// Header forwarding
// ---------------------------------------------------------------------

describe('header forwarding', () => {
  it('parses the access token out of the cookie and sends Bearer + Cookie to Titan', async () => {
    await POST(request({ message: 'hi' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-token-here')
    expect(headers.Cookie).toBe('upswitch_access_token=jwt-token-here')
  })

  it('extracts the access token even when surrounded by other cookies', async () => {
    await POST(
      request({ message: 'hi' }, { cookie: 'foo=bar; upswitch_access_token=middle-token; baz=qux' })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer middle-token')
  })

  it('uses merged cookie-store cookies when the raw request header is incomplete', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValueOnce({
      cookieHeader: 'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh',
      cookieSource: 'cookieStore',
    })

    await POST(
      new NextRequest('https://valuation.upswitch.app/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi' }),
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer store-token')
    expect(headers.Cookie).toBe(
      'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh'
    )
  })

  it('forwards canonical client-context headers (advisor-managed-client routing)', async () => {
    await POST(
      request(
        { message: 'hi' },
        {
          'X-Client-User-Id': 'client-uuid-123',
          'X-Accountant-User-Id': 'accountant-uuid-456',
          'X-Relationship-Id': 'rel-uuid-789',
        }
      )
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('client-uuid-123')
    expect(headers['X-Accountant-User-Id']).toBe('accountant-uuid-456')
    expect(headers['X-Relationship-Id']).toBe('rel-uuid-789')
    // Venus emits CANONICAL ONLY (unlike Mercury, which doubles-up).
    expect(headers['X-Client-Context-User']).toBeUndefined()
    expect(headers['X-Client-Context-Accountant']).toBeUndefined()
    expect(headers['X-Client-Context-Relationship']).toBeUndefined()
  })

  it('upgrades legacy client-context inputs to canonical on emit (back-compat in)', async () => {
    await POST(
      request(
        { message: 'hi' },
        {
          'X-Client-Context-User': 'legacy-client',
          'X-Client-Context-Accountant': 'legacy-accountant',
          'X-Client-Context-Relationship': 'legacy-rel',
        }
      )
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('legacy-client')
    expect(headers['X-Accountant-User-Id']).toBe('legacy-accountant')
    expect(headers['X-Relationship-Id']).toBe('legacy-rel')
  })

  it('omits client-context headers when none are present', async () => {
    await POST(request({ message: 'hi' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------
// Titan payload shape
// ---------------------------------------------------------------------

describe('Titan payload', () => {
  it('concatenates history + current user message', async () => {
    await POST(
      request({
        message: 'follow-up',
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'follow-up' },
    ])
  })

  it('defaults Titan audience to owner scope', async () => {
    await POST(request({ message: 'hi' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.audience).toBe('owner')
  })

  it('forwards an explicit advisor audience claim', async () => {
    await POST(request({ message: 'hi', audience: 'advisor' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.audience).toBe('advisor')
  })

  it('coerces invalid audience claims to owner scope', async () => {
    await POST(request({ message: 'hi', audience: 'admin' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.audience).toBe('owner')
  })

  it('derives hasRevenue / hasEbitda from formData', async () => {
    await POST(
      request({
        message: 'check',
        formData: { revenue: 50000, ebitda: 10000 },
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.hasRevenue).toBe(true)
    expect(body.context.hasEbitda).toBe(true)
  })

  it('hasOwnerSalary flips true when normalizations contains a `salary` category', async () => {
    await POST(
      request({
        message: 'check',
        normalizations: [
          { category: 'rent', status: 'applied' },
          { category: 'salary', status: 'applied' },
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.hasOwnerSalary).toBe(true)
  })

  it('needsNormalization flips true when any normalization has status=pending', async () => {
    await POST(
      request({
        message: 'check',
        normalizations: [
          { category: 'rent', status: 'applied' },
          { category: 'salary', status: 'pending' },
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.needsNormalization).toBe(true)
  })

  it('passes conversationId + formData + normalizations through when provided', async () => {
    await POST(
      request({
        message: 'hi',
        conversationId: 'conv-1',
        formData: { revenue: 1000 },
        normalizations: [{ category: 'x' }],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.conversationId).toBe('conv-1')
    expect(body.formData).toEqual({ revenue: 1000 })
    expect(body.normalizations).toEqual([{ category: 'x' }])
  })

  it('falls back reportId → sessionId when no explicit reportId', async () => {
    await POST(request({ message: 'hi', sessionId: 'session-xyz' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.reportId).toBe('session-xyz')
  })

  it('uses country_code from formData when present, else country', async () => {
    await POST(
      request({
        message: 'hi',
        formData: { country: 'fallback-NL' },
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.countryCode).toBe('fallback-NL')
  })

  it('forwards locale into Titan context for localized fallback and prompting', async () => {
    await POST(request({ message: 'hallo', locale: 'nl-BE' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.locale).toBe('nl-BE')
  })
})

// ---------------------------------------------------------------------
// Error pass-through
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------

describe('response shape', () => {
  it('returns the raw Titan SSE body with text/event-stream headers', async () => {
    const res = await POST(request({ message: 'hi' }))

    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('Connection')).toBe('keep-alive')
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

// ---------------------------------------------------------------------
// Network failures
// ---------------------------------------------------------------------

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
      error: 'Failed to connect to AI service',
      fallback: true,
    })
  })
})
