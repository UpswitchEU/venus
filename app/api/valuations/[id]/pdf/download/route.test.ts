import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
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

describe('/api/valuations/[id]/pdf/download', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
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
})
