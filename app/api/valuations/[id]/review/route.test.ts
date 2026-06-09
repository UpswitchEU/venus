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

describe('GET /api/valuations/[id]/review', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({ cookieHeader: 'session=1' })
  })

  it('rejects requests without a valuation id', async () => {
    const request = new NextRequest('https://valuation.upswitch.app/api/valuations//review')
    const response = await GET(request, { params: Promise.resolve({ id: '' }) })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.message).toBe('Valuation ID is required')
    expect(mocks.fetchJsonWithTimeout).not.toHaveBeenCalled()
  })

  it('proxies review state from Titan with session cookies', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(JSON.stringify({ reviewState: 'auto_generated' }), { status: 200 }),
      json: { reviewState: 'auto_generated' },
    })

    const request = new NextRequest('https://valuation.upswitch.app/api/valuations/report-1/review')
    const response = await GET(request, { params: Promise.resolve({ id: 'report-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      success: true,
      data: { reviewState: 'auto_generated' },
    })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/report-1/review',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Cookie: 'session=1',
        }),
      }),
      10_000
    )
  })
})
