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
  url = 'https://valuation.upswitch.app/api/ai/normalize'
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
    vi.fn().mockResolvedValue(titanJsonResponse(200, { success: true, suggestions: [] }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/ai/normalize', () => {
  it('returns 401 when no Titan access cookie is available', async () => {
    const res = await POST(
      new NextRequest('https://valuation.upswitch.app/api/ai/normalize', {
        method: 'POST',
        body: JSON.stringify({ sessionId: 's1' }),
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      suggestions: [],
      error: 'Authentication required',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards merged cookies, bearer, context headers and normalized payload to Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValueOnce({
      cookieHeader: 'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh',
      cookieSource: 'cookieStore',
    })

    const res = await POST(
      request(
        {
          sessionId: 'session-1',
          financialData: [{ account: '610000', amount: 12000 }],
          source: 'csv',
          companyName: 'Acme',
          industry: 'software',
          ignored: 'not-forwarded',
        },
        {
          'X-Client-User-Id': 'client-1',
          'X-Accountant-User-Id': 'accountant-1',
          'X-Relationship-Id': 'rel-1',
        }
      )
    )

    expect(res.status).toBe(200)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('https://api.upswitch.app/api/v2/orchestration/gap-analysis')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer store-token')
    expect(headers.Cookie).toBe(
      'upswitch_access_token=store-token; upswitch_refresh_token=store-refresh'
    )
    expect(headers.Accept).toBe('application/json')
    expect(headers['X-Client-User-Id']).toBe('client-1')
    expect(headers['X-Accountant-User-Id']).toBe('accountant-1')
    expect(headers['X-Relationship-Id']).toBe('rel-1')
    expect(JSON.parse(init.body as string)).toEqual({
      sessionId: 'session-1',
      financialData: [{ account: '610000', amount: 12000 }],
      source: 'csv',
      companyName: 'Acme',
      industry: 'software',
    })
  })

  it('uses the shared local Titan URL resolver', async () => {
    mocks.getTitanApiUrl.mockReturnValueOnce('http://localhost:3002')

    await POST(request({ sessionId: 's1' }, {}, 'http://localhost:3001/api/ai/normalize'))

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toBe('http://localhost:3002/api/v2/orchestration/gap-analysis')
  })
}
