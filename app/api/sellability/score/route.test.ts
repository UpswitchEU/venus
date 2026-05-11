/**
 * BFF tests for `POST /api/sellability/score` (Venus).
 *
 * This is the endpoint the Venus chat-drawer fires when the user
 * approves a `run_sellability` proposal card. The response shape is
 * NOT Zod-validated here (unlike Mercury's twin) — Venus passes through
 * Titan's `data` blob raw under `{ success:true, data }`, on the
 * assumption that the FE drawer renders whatever it gets and Mercury
 * does the strict schema policing elsewhere.
 *
 * Pins:
 *   - Missing `upswitch_access_token` cookie → 401
 *   - Empty body parse (invalid JSON) → forwarded as `{}` (standard
 *     "compute against persisted profile" path)
 *   - Bearer (from cookie) + Cookie + canonical client-context forwarded
 *   - Titan happy path → `{ success:true, data }`
 *   - Titan non-OK with `message` → status + error pass-through
 *   - Titan non-OK without `message` → "Sellability service unavailable"
 *   - AbortError → 504 with "Sellability request timed out"
 *   - Other thrown error → 500 with the error's message
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

function request(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('https://valuation.upswitch.app/api/sellability/score', {
    method: 'POST',
    body:
      typeof body === 'string'
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
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

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      titanJsonResponse(200, { assessmentId: 'a1', score: 50 }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------

describe('auth gate', () => {
  it('returns 401 when cookie lacks upswitch_access_token', async () => {
    const req = new NextRequest(
      'https://valuation.upswitch.app/api/sellability/score',
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      },
    )

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      error: 'Authentication required',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------

describe('body parsing', () => {
  it('forwards empty body when client sends `{}` (standard recompute path)', async () => {
    await POST(request({}))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('falls back to `{}` when the request body is unparseable JSON', async () => {
    await POST(request('not-json-at-all'))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('forwards arbitrary body fields (no Zod validation at Venus boundary)', async () => {
    await POST(
      request({
        questionAnswers: { top3ConcentrationPct: 42 },
        valuationReportId: 'some-id',
      }),
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(init.body as string)).toEqual({
      questionAnswers: { top3ConcentrationPct: 42 },
      valuationReportId: 'some-id',
    })
  })
})

// ---------------------------------------------------------------------
// Header forwarding
// ---------------------------------------------------------------------

describe('header forwarding', () => {
  it('forwards Bearer (parsed from cookie) + Cookie + Content-Type', async () => {
    await POST(request({}))

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.upswitch.app/api/v2/sellability/score')
    expect((init as RequestInit).method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-token-here')
    expect(headers.Cookie).toBe('upswitch_access_token=jwt-token-here')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Accept).toBe('application/json')
  })

  it('forwards canonical client-context headers (advisor-managed-client routing)', async () => {
    await POST(
      request(
        {},
        {
          'X-Client-User-Id': 'cu-1',
          'X-Accountant-User-Id': 'au-1',
          'X-Relationship-Id': 'rel-1',
        },
      ),
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('cu-1')
    expect(headers['X-Accountant-User-Id']).toBe('au-1')
    expect(headers['X-Relationship-Id']).toBe('rel-1')
  })

  it('upgrades legacy client-context inputs to canonical on emit', async () => {
    await POST(
      request(
        {},
        {
          'X-Client-Context-User': 'legacy-client',
          'X-Client-Context-Accountant': 'legacy-accountant',
          'X-Client-Context-Relationship': 'legacy-rel',
        },
      ),
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('legacy-client')
    expect(headers['X-Accountant-User-Id']).toBe('legacy-accountant')
    expect(headers['X-Relationship-Id']).toBe('legacy-rel')
  })
})

// ---------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------

describe('success', () => {
  it('wraps Titan data under `{ success:true, data }`', async () => {
    const titanData = {
      assessmentId: 'a-uuid',
      score: 75,
      band: 'sale_ready_in_most_ways',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(titanJsonResponse(200, titanData)),
    )

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: titanData })
  })
})

// ---------------------------------------------------------------------
// Error pass-through
// ---------------------------------------------------------------------

describe('error pass-through', () => {
  it('forwards Titan non-OK with the upstream message when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        titanJsonResponse(422, { message: 'Owner profile incomplete' }),
      ),
    )

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body).toEqual({
      success: false,
      error: 'Owner profile incomplete',
    })
  })

  it('falls back to "Sellability service unavailable" when Titan non-OK has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(titanJsonResponse(500, { code: 'internal' })),
    )

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Sellability service unavailable')
  })

  it('also falls back to "Sellability service unavailable" on unparseable JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not-json', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toBe('Sellability service unavailable')
  })

  it('forwards 402 (PLG paywall) with Titan-provided message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        titanJsonResponse(402, {
          message: 'AI chat credit limit reached.',
        }),
      ),
    )

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(402)
    expect(body.error).toBe('AI chat credit limit reached.')
  })
})

// ---------------------------------------------------------------------
// Network failures
// ---------------------------------------------------------------------

describe('network failures', () => {
  it('returns 504 with sellability-specific timeout copy on AbortError', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(504)
    expect(body).toEqual({
      success: false,
      error: 'Sellability request timed out',
    })
  })

  it('returns 500 with the thrown error\'s message on other errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({
      success: false,
      error: 'ECONNREFUSED',
    })
  })

  it('returns 500 with generic "Proxy failed" when the thrown value is not an Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('not-an-error-object'))

    const res = await POST(request({}))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({
      success: false,
      error: 'Proxy failed',
    })
  })
})
