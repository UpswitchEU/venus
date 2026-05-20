import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getResponseSetCookieList: vi.fn(),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: () => 'https://api.upswitch.app',
}))

vi.mock('@/utils/logger', () => ({
  generalLogger: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
  },
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}))

vi.mock('@/utils/bffAuthProxy', () => {
  class AuthUpstreamTimeoutError extends Error {
    readonly code = 'upstream_timeout' as const

    constructor(public readonly targetHost: string) {
      super('Request timeout - please try again')
      this.name = 'AuthUpstreamTimeoutError'
    }
  }

  return {
    AUTH_FETCH_TIMEOUT_AUTH_ME_MS: 9_000,
    AuthUpstreamTimeoutError,
    getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
    getResponseSetCookieList: mocks.getResponseSetCookieList,
  }
})

import { AuthUpstreamTimeoutError } from '@/utils/bffAuthProxy'
import { GET } from './route'

function makeRequest(cookieHeader: string): NextRequest {
  return new NextRequest('https://valuation.upswitch.app/api/auth/me', {
    method: 'GET',
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function getSetCookies(res: Response): string[] {
  return res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''].filter(Boolean)
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getResponseSetCookieList.mockReset()
  mocks.loggerDebug.mockReset()
  mocks.loggerError.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/auth/me', () => {
  it('uses one Titan /me-or-refresh hop on the access-token path', async () => {
    const cookieHeader = 'upswitch_access_token=access; upswitch_refresh_token=refresh'
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader,
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(jsonResponse(200, { id: 'u1' }))
    mocks.getResponseSetCookieList.mockReturnValue([
      'upswitch_access_token=fresh; Path=/; HttpOnly',
    ])

    const res = await GET(makeRequest(cookieHeader))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ id: 'u1' })
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/auth/me-or-refresh',
      {
        method: 'GET',
        headers: { Cookie: cookieHeader },
      },
      9_000
    )
    expect(getSetCookies(res)).toEqual(['upswitch_access_token=fresh; Path=/; HttpOnly'])
  })

  it('uses the same single Titan hop when only a refresh cookie is present', async () => {
    const cookieHeader = 'upswitch_refresh_token=refresh'
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader,
      cookieSource: 'cookieStore',
    })
    mocks.fetchWithTimeout.mockResolvedValue(jsonResponse(200, { id: 'u1' }))
    mocks.getResponseSetCookieList.mockReturnValue([
      'upswitch_access_token=fresh; Path=/; HttpOnly',
      'upswitch_refresh_token=fresh-refresh; Path=/; HttpOnly',
    ])

    const res = await GET(makeRequest(cookieHeader))

    expect(res.status).toBe(200)
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(String(mocks.fetchWithTimeout.mock.calls[0]?.[0])).toBe(
      'https://api.upswitch.app/api/v2/auth/me-or-refresh'
    )
    expect(String(mocks.fetchWithTimeout.mock.calls[0]?.[0])).not.toContain('/refresh')
    expect(getSetCookies(res)).toEqual([
      'upswitch_access_token=fresh; Path=/; HttpOnly',
      'upswitch_refresh_token=fresh-refresh; Path=/; HttpOnly',
    ])
  })

  it('returns 401 without calling Titan when no auth cookies are present', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await GET(makeRequest(''))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ isAuthenticated: false })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('does not treat similarly named cookies as Titan auth cookies', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'not_upswitch_access_token=spoofed; foo_upswitch_refresh_token=spoofed',
      cookieSource: 'header',
    })

    const res = await GET(
      makeRequest('not_upswitch_access_token=spoofed; foo_upswitch_refresh_token=spoofed')
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ isAuthenticated: false })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('forwards Titan clear-cookie headers on 401', async () => {
    const cookieHeader = 'upswitch_refresh_token=dead'
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader,
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }))
    mocks.getResponseSetCookieList.mockReturnValue([
      'upswitch_access_token=; Path=/; Max-Age=0',
      'upswitch_refresh_token=; Path=/; Max-Age=0',
    ])

    const res = await GET(makeRequest(cookieHeader))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ isAuthenticated: false })
    expect(getSetCookies(res)).toEqual([
      'upswitch_access_token=; Path=/; Max-Age=0',
      'upswitch_refresh_token=; Path=/; Max-Age=0',
    ])
  })

  it('maps upstream timeout to 504', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=access',
      cookieSource: 'header',
    })
    mocks.fetchWithTimeout.mockRejectedValue(new AuthUpstreamTimeoutError('api.upswitch.app'))

    const res = await GET(makeRequest('upswitch_access_token=access'))

    expect(res.status).toBe(504)
    expect(await res.json()).toMatchObject({
      isAuthenticated: false,
      error: 'upstream_timeout',
    })
  })
})
