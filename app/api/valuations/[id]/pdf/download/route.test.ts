import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
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

import { GET } from './route'

function request() {
  return new NextRequest('https://valuation.upswitch.app/api/valuations/report-1/pdf/download')
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pdfResponse(): Response {
  const body = new Uint8Array(600)
  body.set([0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
  })
}

function htmlResponse(status = 200): Response {
  return new Response('<!doctype html><html><body>not pdf</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  })
}

function upstreamTimeoutError(): Error {
  const err = new Error('Request timeout - please try again')
  err.name = 'AuthUpstreamTimeoutError'
  return err
}

describe('/api/valuations/[id]/pdf/download', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
  })

  it('forwards delegated client-context headers to Titan on download', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'cookieStore',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: 'https://cdn/report.pdf' }))
      .mockResolvedValueOnce(pdfResponse())

    const req = new NextRequest(
      'https://valuation.upswitch.app/api/valuations/report-1/pdf/download',
      {
        headers: {
          'X-Relationship-Id': 'rel-1',
          'X-Accountant-User-Id': 'adv-1',
          'X-Client-User-Id': 'client-1',
        },
      }
    )

    await GET(req, { params: Promise.resolve({ id: 'report-1' }) })

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/valuations/reports/report-1/pdf'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Relationship-Id': 'rel-1',
          'X-Accountant-User-Id': 'adv-1',
          'X-Client-User-Id': 'client-1',
        }),
      })
    )
  })

  it('regenerates and streams a PDF using merged BFF auth cookies', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'cookieStore',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: null }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: 'https://cdn/report.pdf' }))
      .mockResolvedValueOnce(pdfResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect((await res.arrayBuffer()).byteLength).toBe(600)
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      1,
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
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.upswitch.app/api/v2/valuations/reports/report-1/pdf',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
        },
        body: '{}',
        signal: expect.any(AbortSignal),
      })
    )
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      3,
      'https://cdn/report.pdf',
      expect.objectContaining({
        redirect: 'follow',
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('rejects download when neither request nor cookie store has Titan auth', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ success: false, error: 'Authentication required' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('regenerates once when the persisted storage URL is expired', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, pdfUrl: 'https://cdn/expired-report.pdf' })
      )
      .mockResolvedValueOnce(htmlResponse(403))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, pdfUrl: 'https://cdn/fresh-report.pdf' })
      )
      .mockResolvedValueOnce(pdfResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://cdn/expired-report.pdf',
      expect.objectContaining({ redirect: 'follow' })
    )
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      4,
      'https://cdn/fresh-report.pdf',
      expect.objectContaining({ redirect: 'follow' })
    )
  })

  it('falls back to generation when the initial Titan PDF lookup rejects', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockRejectedValueOnce(new Error('lookup timed out'))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, pdfUrl: 'https://cdn/generated.pdf' })
      )
      .mockResolvedValueOnce(pdfResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', 600)
    expect(consoleWarn).toHaveBeenCalledWith(
      '[PDF Download] Titan PDF lookup failed; attempting regeneration fallback',
      expect.objectContaining({ error: 'lookup timed out' })
    )
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.upswitch.app/api/v2/valuations/reports/report-1/pdf',
      expect.objectContaining({ method: 'POST' })
    )
    consoleWarn.mockRestore()
  })

  it('falls back to generation when the initial Titan PDF lookup returns 5xx', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(503, { message: 'lookup unavailable' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, pdfUrl: 'https://cdn/generated-after-5xx.pdf' })
      )
      .mockResolvedValueOnce(pdfResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', 600)
    expect(consoleWarn).toHaveBeenCalledWith(
      '[PDF Download] Titan PDF lookup returned 5xx; attempting regeneration fallback',
      { status: 503 }
    )
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.upswitch.app/api/v2/valuations/reports/report-1/pdf',
      expect.objectContaining({ method: 'POST' })
    )
    consoleWarn.mockRestore()
  })

  it('regenerates once when storage returns a non-PDF body', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: 'https://cdn/html.pdf' }))
      .mockResolvedValueOnce(htmlResponse())
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, pdfUrl: 'https://cdn/rendered.pdf' })
      )
      .mockResolvedValueOnce(pdfResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(200)
    expect(await res.arrayBuffer()).toHaveProperty('byteLength', 600)
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
  })

  it('returns 504 when sync PDF generation times out', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: null }))
      .mockRejectedValueOnce(upstreamTimeoutError())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      success: false,
      error: 'PDF download timed out. Please try again.',
    })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(consoleWarn).toHaveBeenCalledWith(
      '[PDF Download] Timed out:',
      'Request timeout - please try again'
    )
    expect(consoleError).not.toHaveBeenCalled()
    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })

  it('returns 504 before regeneration when the overall route budget is exhausted', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dateNow = vi.spyOn(Date, 'now')
    dateNow
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(116_000)
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: 'https://cdn/slow.pdf' }))
      .mockResolvedValueOnce(htmlResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      success: false,
      error: 'PDF download timed out. Please try again.',
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(consoleWarn).toHaveBeenCalledWith(
      '[PDF Download] Timed out:',
      'PDF download timeout budget exhausted'
    )
    expect(consoleError).not.toHaveBeenCalled()
    dateNow.mockRestore()
    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })

  it('passes through invite-advisor PDF paywall metadata from Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(402, {
        code: 'INVITE_ADVISOR_REQUIRED',
        message: 'Invite your advisor to unlock this PDF.',
        action: 'invite_accountant',
      })
    )

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report-1' }),
    })

    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invite your advisor to unlock this PDF.',
      code: 'INVITE_ADVISOR_REQUIRED',
      action: 'invite_accountant',
      inviteAdvisorRequired: true,
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('sanitizes the attachment filename derived from the report ID', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token',
      cookieSource: 'header',
    })
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, pdfUrl: 'https://cdn/report.pdf' }))
      .mockResolvedValueOnce(pdfResponse())

    const res = await GET(request(), {
      params: Promise.resolve({ id: 'report/\"unsafe\" id' }),
    })

    expect(res.status).toBe(200)
    const disposition = res.headers.get('Content-Disposition') ?? ''
    expect(disposition).toMatch(
      /^attachment; filename="valuation-report-report-unsafe-id-\d+\.pdf"$/
    )
    expect(disposition).not.toContain('/')
    expect(disposition).not.toContain('\\"')
  })
})
