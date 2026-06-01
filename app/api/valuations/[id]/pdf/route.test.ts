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

describe('/api/valuations/[id]/pdf', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
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
})
