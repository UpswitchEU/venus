import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  AuthUpstreamTimeoutError: class AuthUpstreamTimeoutError extends Error {
    readonly code = 'upstream_timeout' as const

    constructor(public readonly targetHost: string) {
      super('Request timeout - please try again')
      this.name = 'AuthUpstreamTimeoutError'
    }
  },
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

vi.mock('@/utils/logger', () => ({
  createContextLogger: vi.fn(() => loggerMock),
}))

import { GET } from './route'

function request() {
  return new NextRequest('https://valuation.upswitch.app/api/valuations/pdf/status/pdf_report-1')
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function upstreamTimeoutError(): Error {
  const err = new Error('Request timeout - please try again')
  err.name = 'AuthUpstreamTimeoutError'
  return err
}

describe('/api/valuations/pdf/status/[jobId]', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
    loggerMock.debug.mockClear()
    loggerMock.error.mockClear()
    loggerMock.info.mockClear()
    loggerMock.warn.mockClear()
  })

  it('forwards delegated client-context headers to Titan on status polling', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'cookieStore',
    })
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(200, { success: true, status: 'processing', progress: 50 })
    )

    const req = new NextRequest(
      'https://valuation.upswitch.app/api/valuations/pdf/status/pdf_report-1',
      {
        headers: {
          'X-Relationship-Id': 'rel-1',
          'X-Accountant-User-Id': 'adv-1',
          'X-Client-User-Id': 'client-1',
        },
      }
    )

    await GET(req, { params: Promise.resolve({ jobId: 'pdf_report-1' }) })

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Relationship-Id': 'rel-1',
          'X-Accountant-User-Id': 'adv-1',
          'X-Client-User-Id': 'client-1',
        }),
      })
    )
  })

  it('proxies status polling with merged BFF auth cookies', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'cookieStore',
    })
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(200, {
        success: true,
        status: 'completed',
        pdfUrl: 'https://cdn.example/report.pdf',
        progress: 100,
      })
    )

    const res = await GET(request(), {
      params: Promise.resolve({ jobId: 'pdf_report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      status: 'completed',
      pdfUrl: 'https://cdn.example/report.pdf',
      progress: 100,
      error: null,
    })
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/pdf/status/pdf_report-1',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: {
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
        },
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('preserves pending Titan PDF status responses so the client keeps polling', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'cookieStore',
    })
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(200, {
        success: true,
        status: 'pending',
        progress: 0,
        error: 'Could not read PDF job from queue yet: Connection is closed',
      })
    )

    const res = await GET(request(), {
      params: Promise.resolve({ jobId: 'pdf_report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      status: 'pending',
      pdfUrl: null,
      progress: 0,
      error: 'Could not read PDF job from queue yet: Connection is closed',
    })
  })

  it('rejects polling when neither request nor cookie store has Titan auth', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await GET(request(), {
      params: Promise.resolve({ jobId: 'pdf_report-1' }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ success: false, error: 'Authentication required' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('returns 504 when Titan status polling times out', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch.mockRejectedValue(upstreamTimeoutError())

    const res = await GET(request(), {
      params: Promise.resolve({ jobId: 'pdf_report-1' }),
    })

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      success: false,
      error: 'PDF status check timed out. Please try again.',
    })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(loggerMock.warn).toHaveBeenCalledWith('Titan PDF status request timed out', {
      error: 'Request timeout - please try again',
    })
    expect(loggerMock.error).not.toHaveBeenCalled()
  })

  it('normalizes invite-advisor paywall responses while polling', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(402, {
        code: 'INVITE_ADVISOR_REQUIRED',
        message: 'Invite your advisor',
        action: 'invite_accountant',
      })
    )

    const res = await GET(request(), {
      params: Promise.resolve({ jobId: 'pdf_report-1' }),
    })

    expect(res.status).toBe(402)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invite your advisor',
      code: 'INVITE_ADVISOR_REQUIRED',
      action: 'invite_accountant',
      inviteAdvisorRequired: true,
    })
  })
})
