import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
  fetchJsonWithTimeout: vi.fn(),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: mocks.fetchJsonWithTimeout,
}))

import { GET } from './route'

describe('GET /api/attestations/readiness', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({ cookieHeader: 'session=1' })
  })

  it('proxies readiness from Titan with session cookies', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(
        JSON.stringify({ attestEnabled: true, productionSigningReady: true }),
        { status: 200 }
      ),
      json: { attestEnabled: true, productionSigningReady: true },
    })

    const request = new NextRequest('https://valuation.upswitch.app/api/attestations/readiness')
    const response = await GET(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ attestEnabled: true, productionSigningReady: true })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/attestations/readiness',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Cookie: 'session=1',
        }),
      }),
      10_000
    )
  })

  it('returns a disabled readiness envelope when the probe throws', async () => {
    mocks.fetchJsonWithTimeout.mockRejectedValue(new Error('network down'))

    const request = new NextRequest('https://valuation.upswitch.app/api/attestations/readiness')
    const response = await GET(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toMatchObject({ enabled: false })
  })
})
