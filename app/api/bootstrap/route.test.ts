import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_CONTEXT_HEADERS } from '../../../src/constants/headers'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getResponseSetCookieList: vi.fn(),
  loggerDebug: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: () => 'https://api.upswitch.app',
}))

vi.mock('@/utils/logger', () => ({
  generalLogger: {
    debug: mocks.loggerDebug,
    warn: mocks.loggerWarn,
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
    AuthUpstreamTimeoutError,
    getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
    getResponseSetCookieList: mocks.getResponseSetCookieList,
  }
})

import { AuthUpstreamTimeoutError } from '@/utils/bffAuthProxy'
import { POST } from './route'

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('https://valuation.upswitch.app/api/bootstrap', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'upswitch_access_token=access',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getResponseSetCookieList.mockReset()
  mocks.loggerDebug.mockReset()
  mocks.loggerWarn.mockReset()
  mocks.loggerError.mockReset()
  mocks.getBffCookieHeaderForTitan.mockResolvedValue({
    cookieHeader: 'upswitch_access_token=access',
    refreshTokenFromStore: 'refresh',
  })
  mocks.getResponseSetCookieList.mockReturnValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('POST /api/bootstrap', () => {
  it('proxies a successful Titan bootstrap response', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: { report: { mode: 'existing', reportId: 'rep-1' } },
      })
    )

    const res = await POST(
      makeRequest({ reportId: 'rep-1', locale: 'nl' }, { 'x-correlation-id': 'trace-1' })
    )
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWithTimeout.mock.calls[0]?.[0]).toBe(
      'https://api.upswitch.app/api/v2/valuations/bootstrap'
    )
  })

  it('forwards partial delegated headers (accountant + relationship, no client user)', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { report: { mode: 'existing' } } })
    )

    await POST(
      makeRequest(
        { reportId: 'rep-1' },
        {
          [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: 'acct-1',
          [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: 'rel-1',
        }
      )
    )

    const titanHeaders = mocks.fetchWithTimeout.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >
    expect(titanHeaders[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]).toBe('acct-1')
    expect(titanHeaders[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]).toBe('rel-1')
    expect(titanHeaders[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]).toBeUndefined()
  })

  it('returns 504 when Titan bootstrap times out', async () => {
    mocks.fetchWithTimeout.mockRejectedValueOnce(new AuthUpstreamTimeoutError('api.upswitch.app'))

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    expect(res.status).toBe(504)
    expect(payload.error).toBe('Bootstrap request timed out')
  })

  it('returns 504 when Titan bootstrap aborts without a timeout error class', async () => {
    const abortError = new Error('signal is aborted without reason')
    abortError.name = 'AbortError'
    mocks.fetchWithTimeout.mockRejectedValueOnce(abortError)

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    expect(res.status).toBe(504)
    expect(payload.error).toBe('Bootstrap request timed out')
  })

  it('returns 504 when Titan response body exceeds the route budget', async () => {
    vi.useFakeTimers()
    mocks.fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn(
        () =>
          new Promise(() => {
            // Intentionally never resolves; the route-level body budget must win.
          })
      ),
    } as unknown as Response)

    const responsePromise = POST(makeRequest({ reportId: 'rep-1' }))

    await vi.advanceTimersByTimeAsync(29_000)
    const res = await responsePromise
    const payload = await res.json()

    expect(res.status).toBe(504)
    expect(payload.error).toBe('Bootstrap request timed out')
  })

  it('returns structured error when Titan response body is not JSON', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(
      new Response('upstream unavailable', { status: 503 })
    )

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    expect(res.status).toBe(503)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('Invalid response from bootstrap service')
  })

  it('returns 502 when Titan returns 200 with an invalid JSON body', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(new Response('not-json', { status: 200 }))

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    expect(res.status).toBe(502)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('Invalid response from bootstrap service')
  })

  it('refreshes token and retries bootstrap after an initial 401', async () => {
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { report: { mode: 'existing' } } })
      )

    mocks.getResponseSetCookieList
      .mockReturnValueOnce(['upswitch_access_token=new; Path=/; HttpOnly'])
      .mockReturnValueOnce([])

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(3)
    expect(mocks.fetchWithTimeout.mock.calls[0]?.[0]).toContain('/valuations/bootstrap')
    expect(mocks.fetchWithTimeout.mock.calls[1]?.[0]).toContain('/auth/refresh')
    expect(mocks.fetchWithTimeout.mock.calls[2]?.[0]).toContain('/valuations/bootstrap')
  })

  it('returns 401 when the post-401 refresh is a definitive auth rejection (403)', async () => {
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(403, { success: false, error: 'Forbidden' }))

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    // A genuinely-invalid session still ejects to login (correct).
    expect(res.status).toBe(401)
    expect(payload.error).toBe('Session expired')
    // bootstrap (401) + refresh (403), no retry of bootstrap.
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2)
    expect(mocks.fetchWithTimeout.mock.calls[1]?.[0]).toContain('/auth/refresh')
  })

  it('returns 503 (not 401) when the post-401 refresh fails transiently (Titan 5xx)', async () => {
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(503, { success: false, error: 'Service Unavailable' }))

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    // 503 → SessionBootstrapService maps to a retryable timeout state, NOT a
    // Mercury login redirect. A cookie-valid advisor is never ejected because
    // the auth service was momentarily unavailable under pool pressure.
    expect(res.status).toBe(503)
    expect(payload.error).toBe('Authentication temporarily unavailable')
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2)
  })

  it('returns 503 (not 401) when the post-401 refresh hop times out', async () => {
    mocks.fetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Unauthorized' }))
      .mockRejectedValueOnce(new AuthUpstreamTimeoutError('api.upswitch.app'))

    const res = await POST(makeRequest({ reportId: 'rep-1' }))
    const payload = await res.json()

    expect(res.status).toBe(503)
    expect(payload.error).toBe('Authentication temporarily unavailable')
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(2)
  })
})
