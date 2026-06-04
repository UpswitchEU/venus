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

import { POST } from './route'

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(
    'https://valuation.upswitch.app/api/valuations/reports/report-1/buyer-ready-package',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }
  )
}

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/valuations/reports/[reportId]/buyer-ready-package', () => {
  beforeEach(() => {
    mocks.fetchWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
  })

  it('proxies buyer-ready package generation to Titan with auth and agent action headers', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      titanJsonResponse(200, { success: true, data: { entityId: 'entity-1' } })
    )

    const res = await POST(
      request(
        { regionLabel: 'Flanders' },
        {
          'X-Upswitch-Agent-Tool-Name': 'generate_buyer_ready_package',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-1',
        }
      ),
      { params: Promise.resolve({ reportId: 'report-1' }) }
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { entityId: 'entity-1' } })
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/reports/report-1/buyer-ready-package',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          Authorization: 'Bearer jwt-token',
          'X-Upswitch-Agent-Tool-Name': 'generate_buyer_ready_package',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-1',
        },
        credentials: 'include',
        body: JSON.stringify({ regionLabel: 'Flanders' }),
      },
      110_000
    )
  })

  it('rejects unauthenticated generation requests before hitting Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await POST(request({}), {
      params: Promise.resolve({ reportId: 'report-1' }),
    })

    expect(res.status).toBe(401)
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })
})
