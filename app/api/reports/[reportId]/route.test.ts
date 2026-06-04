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

import { DELETE } from './route'

function request(headers = {}) {
  return new NextRequest('https://valuation.upswitch.app/api/reports/report-1', {
    method: 'DELETE',
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

describe('DELETE /api/reports/[reportId]', () => {
  it('forwards merged auth cookies and guest session to Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(titanJsonResponse(200, { success: true }))

    const res = await DELETE(request({ 'x-guest-session-id': 'guest-1' }), {
      params: Promise.resolve({ reportId: 'report id/with spaces' }),
    })

    expect(res.status).toBe(200)
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/reports/report%20id%2Fwith%20spaces',
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          'x-guest-session-id': 'guest-1',
        },
        credentials: 'include',
      },
      10_000
    )
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })

  it('returns a private 400 when report id is missing', async () => {
    const res = await DELETE(request(), { params: Promise.resolve({ reportId: '' }) })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      message: 'Report ID is required',
    })
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })
})
