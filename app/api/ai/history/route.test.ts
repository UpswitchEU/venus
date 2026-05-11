/**
 * BFF tests for `GET /api/ai/history?reportId=...` (Venus).
 *
 * Venus history mirrors Mercury's defensive "never block first render"
 * contract, with two Venus-specific twists:
 *
 *   - Auth gate is graceful: missing cookie → 200 with empty history
 *     (not 401) so the calculator can boot without a logged-in user.
 *   - Timeout maps to 504 (Mercury returns 200). Because Venus's
 *     calculator surfaces a "load history" spinner instead of merging
 *     silently, surfacing the timeout helps the UI degrade overtly
 *     vs. spinning forever.
 *
 * Pins:
 *   - Missing reportId → 400 (programmer error)
 *   - Missing cookie/auth → 200 empty history (graceful)
 *   - Cookie + Bearer (parsed from cookie) forwarded to Titan
 *   - reportId URL-encoded in Titan path
 *   - Client-context headers forwarded
 *   - Titan non-OK → 200 empty (don't block dock render)
 *   - Titan body unparseable → 200 with `{success:false, messages:[]}` fallback
 *   - fetchWithTimeout error message contains "timeout" → 504
 *   - Any other thrown error → 200 empty (graceful)
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchWithTimeout = vi.fn()

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}))

import { GET } from './route'

function request(
  reportId: string | null,
  headers: Record<string, string> = {},
): NextRequest {
  const url =
    reportId === null
      ? 'https://valuation.upswitch.app/api/ai/history'
      : `https://valuation.upswitch.app/api/ai/history?reportId=${encodeURIComponent(reportId)}`
  return new NextRequest(url, {
    method: 'GET',
    headers: {
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
  mockFetchWithTimeout.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reportId guard', () => {
  it('returns 400 when reportId is missing from query', async () => {
    const res = await GET(request(null))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ success: false, error: 'reportId is required' })
    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })
})

describe('auth gate (graceful)', () => {
  it('returns 200 with empty history when no upswitch_access_token cookie', async () => {
    const req = new NextRequest(
      'https://valuation.upswitch.app/api/ai/history?reportId=venus_calc_abc',
      { method: 'GET' },
    )

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      conversationId: null,
      messages: [],
    })
    expect(mockFetchWithTimeout).not.toHaveBeenCalled()
  })
})

describe('Titan call', () => {
  it('URL-encodes reportId and forwards Bearer + Cookie to Titan', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      titanJsonResponse(200, { conversationId: 'abc', messages: [] }),
    )

    await GET(request('venus_calc/with/slashes'))

    const [url, init] = mockFetchWithTimeout.mock.calls[0]
    expect(url).toBe(
      'https://api.upswitch.app/api/v2/ai/conversations/venus_calc%2Fwith%2Fslashes/history',
    )
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-token-here')
    expect(headers.Cookie).toBe('upswitch_access_token=jwt-token-here')
  })

  it('forwards canonical client-context headers when present', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      titanJsonResponse(200, { conversationId: null, messages: [] }),
    )

    await GET(
      request('venus_calc_xyz', {
        'X-Client-User-Id': 'cu-1',
        'X-Accountant-User-Id': 'au-1',
        'X-Relationship-Id': 'rel-1',
      }),
    )

    const [, init] = mockFetchWithTimeout.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-Client-User-Id']).toBe('cu-1')
    expect(headers['X-Accountant-User-Id']).toBe('au-1')
    expect(headers['X-Relationship-Id']).toBe('rel-1')
  })

  it('passes through Titan success payload verbatim', async () => {
    const titanPayload = {
      success: true,
      conversationId: 'conv-xyz',
      messages: [
        { id: 'm1', role: 'user', content: 'hi', created_at: '2026-05-10T00:00:00Z' },
      ],
    }
    mockFetchWithTimeout.mockResolvedValue(titanJsonResponse(200, titanPayload))

    const res = await GET(request('venus_calc_x'))
    const body = await res.json()

    expect(body).toEqual(titanPayload)
  })
})

describe('defensive fallbacks', () => {
  it('returns 200 empty history when Titan returns 500', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      titanJsonResponse(500, { error: 'titan down' }),
    )

    const res = await GET(request('venus_calc'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      conversationId: null,
      messages: [],
    })
  })

  it('returns 200 empty history when Titan returns 401 (token expired mid-session)', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      titanJsonResponse(401, { message: 'Unauthorized' }),
    )

    const res = await GET(request('venus_calc'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.messages).toEqual([])
  })

  it('returns 200 with {success:false, messages:[]} when Titan body is not parseable JSON', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    const res = await GET(request('venus_calc'))
    const body = await res.json()

    expect(res.status).toBe(200)
    // Venus uses `{success:false, messages:[]}` for parse-failure fallback —
    // Mercury uses `{success:true}`. Pin Venus's behavior explicitly.
    expect(body).toEqual({ success: false, messages: [] })
  })

  it('returns 504 when fetchWithTimeout throws an error containing "timeout"', async () => {
    mockFetchWithTimeout.mockRejectedValue(
      new Error('Request timeout after 10000ms'),
    )

    const res = await GET(request('venus_calc'))
    const body = await res.json()

    expect(res.status).toBe(504)
    expect(body).toEqual({
      success: true,
      conversationId: null,
      messages: [],
    })
  })

  it('returns 200 empty history when fetchWithTimeout throws a non-timeout error', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('ECONNREFUSED'))

    const res = await GET(request('venus_calc'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      conversationId: null,
      messages: [],
    })
  })
})
