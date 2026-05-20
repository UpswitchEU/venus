import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { POST } from './route'

function request(
  body: unknown,
  headers: Record<string, string> = {},
  url = 'https://valuation.upswitch.app/api/ai/suggestion'
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

beforeEach(() => {
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getBffCookieHeaderForTitan.mockImplementation(
    async (requestLike: Pick<Request, 'headers'>) => ({
      cookieHeader: requestLike.headers.get('cookie') || '',
      cookieSource: requestLike.headers.get('cookie') ? 'header' : 'cookieStore',
    })
  )
  mocks.getTitanApiUrl.mockReset()
  mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(titanJsonResponse(200, { suggestion: 'Use sector median EBITDA.' }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/ai/suggestion', () => {
  it('returns 401 when no Titan access cookie is available', async () => {
    const res = await POST(
      new NextRequest('https://valuation.upswitch.app/api/ai/suggestion', {
        method: 'POST',
        body: JSON.stringify({ field: 'ebitda', label: 'EBITDA' }),
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      error: 'Authentication required',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards bearer, merged cookies, Accept and client-context headers to Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValueOnce({
      cookieHeader: 'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh',
      cookieSource: 'cookieStore',
    })

    const res = await POST(
      request(
        { field: 'ebitda', label: 'EBITDA', locale: 'nl' },
        {
          'X-Client-Context-User': 'legacy-client',
          'X-Client-Context-Accountant': 'legacy-accountant',
          'X-Client-Context-Relationship': 'legacy-rel',
        }
      )
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.suggestion).toBe('Use sector median EBITDA.')
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.upswitch.app/api/v2/ai/generate-question')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer store-token')
    expect(headers.Cookie).toBe(
      'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh'
    )
    expect(headers.Accept).toBe('application/json')
    expect(headers['X-Client-User-Id']).toBe('legacy-client')
    expect(headers['X-Accountant-User-Id']).toBe('legacy-accountant')
    expect(headers['X-Relationship-Id']).toBe('legacy-rel')
  })

  it('uses the shared local Titan URL resolver', async () => {
    mocks.getTitanApiUrl.mockReturnValueOnce('http://localhost:3002')

    await POST(request({ field: 'rent', label: 'Rent' }, {}, 'http://localhost:3001/api/ai/suggestion'))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3002/api/v2/ai/generate-question')
  })

  it('preserves Titan non-OK status with a non-leaky error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(titanJsonResponse(503, { message: 'upstream down' }))
    )

    const res = await POST(request({ field: 'rent', label: 'Rent' }))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body).toEqual({
      success: false,
      error: 'Suggestion service unavailable',
    })
  })
}
