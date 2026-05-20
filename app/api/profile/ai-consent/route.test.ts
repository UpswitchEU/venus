import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: () => 'https://api.upswitch.app',
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/logger', () => ({
  apiLogger: {
    error: mocks.loggerError,
  },
}))

import { DELETE, GET, POST } from './route'

function request(
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('https://valuation.upswitch.app/api/profile/ai-consent', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.loggerError.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/api/profile/ai-consent', () => {
  it('returns 401 when no Titan access cookie is available', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_refresh_token=refresh-only',
      cookieSource: 'header',
    })

    const res = await GET(request('GET'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('GET forwards bearer, cookies, IP and UA metadata to Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=access.jwt; upswitch_refresh_token=refresh.jwt',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        active: false,
        currentPolicyVersion: 'ai-chat-v2',
      })
    )

    const res = await GET(
      request('GET', undefined, {
        'x-forwarded-for': '203.0.113.10',
        'user-agent': 'Vitest',
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.currentPolicyVersion).toBe('ai-chat-v2')
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/ai/consent',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer access.jwt',
          Cookie: 'upswitch_access_token=access.jwt; upswitch_refresh_token=refresh.jwt',
          'X-Forwarded-For': '203.0.113.10',
          'User-Agent': 'Vitest',
        },
        credentials: 'include',
      },
      5_000
    )
  })

  it('POST forwards the grant body and preserves Titan status', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=access.jwt',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      jsonResponse(201, {
        success: true,
        active: true,
        consentId: 'consent-1',
      })
    )

    const res = await POST(request('POST', { scope: 'chat', locale: 'nl' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.consentId).toBe('consent-1')
    const [, init] = mocks.fetchWithTimeout.mock.calls[0]
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ scope: 'chat', locale: 'nl' }),
    })
  })

  it('DELETE forwards revoke requests', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=access.jwt',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(jsonResponse(200, { success: true, active: false }))

    const res = await DELETE(request('DELETE'))

    expect(res.status).toBe(200)
    const [, init] = mocks.fetchWithTimeout.mock.calls[0]
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('returns a consent-service envelope when Titan is unreachable', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=access.jwt',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockRejectedValue(new Error('ECONNREFUSED'))

    const res = await GET(request('GET'))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body).toEqual({
      success: false,
      code: 'CONSENT_SERVICE_UNAVAILABLE',
      message: 'Consent service unreachable',
    })
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})
