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

import { POST } from './route'

describe('POST /api/valuations/[id]/review/approve', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({ cookieHeader: 'session=1' })
  })

  it('rejects requests without a valuation id', async () => {
    const request = new NextRequest(
      'https://valuation.upswitch.app/api/valuations//review/approve',
      { method: 'POST', body: JSON.stringify({}) }
    )
    const response = await POST(request, { params: Promise.resolve({ id: '' }) })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.message).toBe('Valuation ID is required')
    expect(mocks.fetchJsonWithTimeout).not.toHaveBeenCalled()
  })

  it('proxies approval to Titan with optional notes', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(JSON.stringify({ reviewState: 'accountant_approved' }), {
        status: 200,
      }),
      json: { reviewState: 'accountant_approved' },
    })

    const request = new NextRequest(
      'https://valuation.upswitch.app/api/valuations/report-1/review/approve',
      {
        method: 'POST',
        body: JSON.stringify({ notes: 'Looks good' }),
      }
    )
    const response = await POST(request, { params: Promise.resolve({ id: 'report-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      success: true,
      data: { reviewState: 'accountant_approved' },
    })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/valuations/report-1/approve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Cookie: 'session=1',
        }),
        body: JSON.stringify({ notes: 'Looks good' }),
      }),
      35_000
    )
    expect(mocks.getTitanApiUrl).toHaveBeenCalledWith(request)
  })

  it('returns a friendly message when Titan is temporarily unavailable', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(JSON.stringify({ message: 'Service Unavailable' }), {
        status: 503,
      }),
      json: { message: 'Service Unavailable' },
    })

    const request = new NextRequest(
      'https://valuation.upswitch.app/api/valuations/report-1/review/approve',
      { method: 'POST', body: JSON.stringify({}) }
    )
    const response = await POST(request, { params: Promise.resolve({ id: 'report-1' }) })
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json).toEqual({
      success: false,
      message: 'The valuation service is temporarily busy. Please try again in a moment.',
    })
  })

  it('returns a friendly message when the Titan approve call times out', async () => {
    mocks.fetchJsonWithTimeout.mockRejectedValue(new Error('fetch timeout after 35000ms'))

    const request = new NextRequest(
      'https://valuation.upswitch.app/api/valuations/report-1/review/approve',
      { method: 'POST', body: JSON.stringify({}) }
    )
    const response = await POST(request, { params: Promise.resolve({ id: 'report-1' }) })
    const json = await response.json()

    expect(response.status).toBe(504)
    expect(json).toEqual({
      success: false,
      message: 'The valuation service is temporarily busy. Please try again in a moment.',
    })
  })
})
