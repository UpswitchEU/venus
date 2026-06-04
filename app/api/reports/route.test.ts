import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
  fetchJsonWithTimeout: async (...args: unknown[]) => {
    const response = (await mocks.fetchWithTimeout(...args)) as Response
    return { response, json: await response.json().catch(() => null) }
  },
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { GET } from './route'

function request(path = '/api/reports?limit=5&offset=10&status=active', headers = {}) {
  return new NextRequest(`https://valuation.upswitch.app${path}`, {
    method: 'GET',
    headers,
  })
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getTitanApiUrl.mockClear()
  mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
})

describe('GET /api/reports', () => {
  it('does not cache authenticated report lists across requests', async () => {
    mocks.getBffCookieHeaderForTitan
      .mockResolvedValueOnce({
        cookieHeader: 'upswitch_access_token=user-a',
        cookieSource: 'header',
      })
      .mockResolvedValueOnce({
        cookieHeader: 'upswitch_access_token=user-b',
        cookieSource: 'header',
      })
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(titanJsonResponse(200, { reports: ['a-only'] }))
      .mockResolvedValueOnce(titanJsonResponse(200, { reports: ['b-only'] }))

    const first = await GET(request())
    const second = await GET(request())

    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2)
    expect(await first.json()).toEqual({ reports: ['a-only'] })
    expect(await second.json()).toEqual({ reports: ['b-only'] })
    expect(first.headers.get('Cache-Control')).toContain('no-store')
    expect(second.headers.get('Cache-Control')).toContain('no-store')
    expect(first.headers.get('X-Cache')).toBeNull()
    expect(second.headers.get('X-Cache')).toBeNull()
  })

  it('forwards merged auth cookies, guest session, and canonical client context', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(titanJsonResponse(200, { reports: [] }))

    await GET(
      request('/api/reports?limit=200&offset=-5&status=in-review', {
        'x-guest-session-id': 'guest-1',
        'x-client-context-user': 'legacy-client',
        'x-client-context-accountant': 'legacy-accountant',
        'x-client-context-relationship': 'legacy-rel',
      })
    )

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/reports?skip=0&take=100&status=in-review',
      {
        method: 'GET',
        headers: {
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          'x-guest-session-id': 'guest-1',
          'X-Client-User-Id': 'legacy-client',
          'X-Accountant-User-Id': 'legacy-accountant',
          'X-Relationship-Id': 'legacy-rel',
        },
      },
      10_000
    )
  })

  it('returns 401 without calling Titan when no auth or guest session is present', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Authentication required' })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('URL-encodes status before proxying to Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(titanJsonResponse(200, { reports: [] }))

    await GET(request('/api/reports?status=active%26take%3D999'))

    const [url] = mocks.fetchWithTimeout.mock.calls[0] as [string]
    expect(url).toBe(
      'https://api.upswitch.app/api/v2/valuations/reports?skip=0&take=20&status=active%26take%3D999'
    )
  })
})
