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

import { GET, POST } from './route'

function request(method: 'GET' | 'POST') {
  return new NextRequest('https://valuation.upswitch.app/api/valuations/report-1/pdf', {
    method,
  })
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authFromCookieStore() {
  mocks.getBffCookieHeaderForTitan.mockResolvedValue({
    cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
    cookieSource: 'cookieStore',
  })
}

function upstreamTimeoutError(): Error {
  const err = new Error('Request timeout - please try again')
  err.name = 'AuthUpstreamTimeoutError'
  return err
}

describe('/api/valuations/[id]/pdf', () => {
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

  it('forwards delegated client-context headers to Titan on generation', async () => {
    authFromCookieStore()
    mocks.fetch.mockResolvedValue(titanJsonResponse(200, { success: true, jobId: 'pdf_report-1' }))

    const req = new NextRequest('https://valuation.upswitch.app/api/valuations/report-1/pdf', {
      method: 'POST',
      headers: {
        'X-Relationship-Id': 'rel-1',
        'X-Accountant-User-Id': 'adv-1',
        'X-Client-User-Id': 'client-1',
      },
    })

    await POST(req, { params: Promise.resolve({ id: 'report-1' }) })

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

  it('queues async PDF generation with merged BFF auth cookies', async () => {
    authFromCookieStore()
    mocks.fetch.mockResolvedValue(titanJsonResponse(200, { success: true, jobId: 'pdf_report-1' }))

    const res = await POST(request('POST'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, jobId: 'pdf_report-1' })
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/reports/report-1/pdf/async',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
        },
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('checks existing PDF status with merged BFF auth cookies', async () => {
    authFromCookieStore()
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(200, { success: true, pdfUrl: 'https://cdn.example/report.pdf' })
    )

    const res = await GET(request('GET'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      status: 'ready',
      pdfUrl: 'https://cdn.example/report.pdf',
    })
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/reports/report-1/pdf',
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

  it('rejects generation when neither request nor cookie store has Titan auth', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await POST(request('POST'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ success: false, error: 'Authentication required' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('returns 504 when Titan async generation times out', async () => {
    authFromCookieStore()
    mocks.fetch.mockRejectedValue(upstreamTimeoutError())

    const res = await POST(request('POST'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      success: false,
      error: 'PDF generation timed out. Please try again.',
    })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(loggerMock.warn).toHaveBeenCalledWith('Titan PDF generation timed out', {
      error: 'Request timeout - please try again',
    })
    expect(loggerMock.error).not.toHaveBeenCalled()
  })

  it('returns 504 when Titan async generation JSON body stalls after headers', async () => {
    vi.useFakeTimers()
    authFromCookieStore()
    mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => {
      const signal = init?.signal
      return Promise.resolve({
        ok: true,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      } as unknown as Response)
    })

    const responsePromise = POST(request('POST'), {
      params: Promise.resolve({ id: 'report-1' }),
    })
    await Promise.resolve()
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(110_001)
    const res = await responsePromise

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      success: false,
      error: 'PDF generation timed out. Please try again.',
    })
    expect(loggerMock.warn).toHaveBeenCalledWith('Titan PDF generation timed out', {
      error: 'Request timeout - please try again',
    })
    expect(loggerMock.error).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('passes through transient Titan generation conflicts without error logging', async () => {
    authFromCookieStore()
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(409, { error: 'Report changed while the PDF was rendering.' })
    )

    const res = await POST(request('POST'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Report changed while the PDF was rendering.',
    })
    expect(loggerMock.warn).toHaveBeenCalledWith('Titan PDF API returned a transient status', {
      status: 409,
      body: { error: 'Report changed while the PDF was rendering.' },
    })
    expect(loggerMock.error).not.toHaveBeenCalled()
  })

  it('returns 504 when Titan PDF lookup times out', async () => {
    authFromCookieStore()
    mocks.fetch.mockRejectedValue(upstreamTimeoutError())

    const res = await GET(request('GET'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      success: false,
      error: 'PDF status check timed out. Please try again.',
    })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(loggerMock.warn).toHaveBeenCalledWith('Titan PDF status lookup timed out', {
      error: 'Request timeout - please try again',
    })
    expect(loggerMock.error).not.toHaveBeenCalled()
  })

  it('normalizes invite-advisor paywall responses for generation', async () => {
    authFromCookieStore()
    mocks.fetch.mockResolvedValue(
      titanJsonResponse(402, {
        code: 'INVITE_ADVISOR_REQUIRED',
        message: 'Invite an advisor first',
        action: 'invite_accountant',
      })
    )

    const res = await POST(request('POST'), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(402)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invite an advisor first',
      code: 'INVITE_ADVISOR_REQUIRED',
      action: 'invite_accountant',
      inviteAdvisorRequired: true,
    })
    expect(loggerMock.error).not.toHaveBeenCalled()
  })

  it('encodes report IDs before proxying to Titan', async () => {
    authFromCookieStore()
    mocks.fetch.mockResolvedValue(titanJsonResponse(200, { success: true, pdfUrl: null }))

    const res = await GET(request('GET'), {
      params: Promise.resolve({ id: 'val_session/with space' }),
    })

    expect(res.status).toBe(200)
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/reports/val_session%2Fwith%20space/pdf',
      expect.any(Object)
    )
  })
})
