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
  return new NextRequest('https://valuation.upswitch.app/api/valuations/pdf/status/pdf_report-1')
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('/api/valuations/pdf/status/[jobId]', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
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
})
