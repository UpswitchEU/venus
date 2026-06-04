import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchJsonWithTimeout: vi.fn(),
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: mocks.fetchJsonWithTimeout,
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { GET } from './route'

function request(query: string) {
  return new NextRequest(`https://valuation.upswitch.app/api/nace/search?${query}`)
}

function jsonResponse(status: number): Response {
  return new Response(null, { status })
}

beforeEach(() => {
  mocks.fetchJsonWithTimeout.mockReset()
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.getTitanApiUrl.mockClear()
  mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
  mocks.getBffCookieHeaderForTitan.mockResolvedValue({
    cookieHeader: 'upswitch_access_token=jwt-token',
  })
})

describe('/api/nace/search', () => {
  it('encodes business type ids and forwards cookies', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValueOnce({
      response: jsonResponse(200),
      json: { success: true, data: [{ code: '10.11' }] },
    })

    const response = await GET(request('businessTypeId=type%2Fwith%20spaces'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: [{ code: '10.11' }] })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/business-types/type%2Fwith%20spaces/nace',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: 'upswitch_access_token=jwt-token',
        },
      },
      6_000
    )
  })

  it('maps upstream timeouts to 504', async () => {
    mocks.fetchJsonWithTimeout.mockRejectedValueOnce(
      new Error('Request timeout - please try again')
    )

    const response = await GET(request('q=bakker'))

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      success: false,
      data: [],
      error: 'Request timed out',
    })
  })
})
