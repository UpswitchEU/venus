import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
  fetchJsonWithTimeout: vi.fn(),
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: mocks.fetchJsonWithTimeout,
}))

import { proxyTitanReviewJsonRoute, TITAN_REVIEW_PROXY_TIMEOUT_MS } from './proxyTitanReviewJson'

describe('proxyTitanReviewJsonRoute', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({ cookieHeader: 'session=1' })
  })

  it('proxies Titan JSON with cookies and the review-route timeout budget', async () => {
    mocks.fetchJsonWithTimeout.mockResolvedValue({
      response: new Response(JSON.stringify({ reviewState: 'auto_generated' }), { status: 200 }),
      json: { reviewState: 'auto_generated' },
    })

    const request = new NextRequest(
      'https://preview.valuation.upswitch.app/api/valuations/r1/review'
    )
    const response = await proxyTitanReviewJsonRoute(
      request,
      'https://api-staging.upswitch.app/api/v2/valuations/r1/review',
      { method: 'GET' },
      { defaultErrorMessage: 'Failed to load review state' }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, data: { reviewState: 'auto_generated' } })
    expect(mocks.fetchJsonWithTimeout).toHaveBeenCalledWith(
      'https://api-staging.upswitch.app/api/v2/valuations/r1/review',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Cookie: 'session=1' }),
      }),
      TITAN_REVIEW_PROXY_TIMEOUT_MS
    )
  })

  it('maps upstream timeouts to the shared transient failure envelope', async () => {
    mocks.fetchJsonWithTimeout.mockRejectedValue(new Error('fetch timeout after 35000ms'))

    const request = new NextRequest(
      'https://preview.valuation.upswitch.app/api/valuations/r1/review'
    )
    const response = await proxyTitanReviewJsonRoute(
      request,
      'https://api-staging.upswitch.app/api/v2/valuations/r1/review',
      { method: 'GET' },
      { defaultErrorMessage: 'Failed to load review state' }
    )
    const json = await response.json()

    expect(response.status).toBe(504)
    expect(json).toEqual({
      success: false,
      message: 'The valuation service is temporarily busy. Please try again in a moment.',
    })
  })

  it('maps abort-shaped upstream failures to the shared transient failure envelope', async () => {
    const abortError = new Error('signal is aborted without reason')
    abortError.name = 'AbortError'
    mocks.fetchJsonWithTimeout.mockRejectedValue(abortError)

    const request = new NextRequest(
      'https://preview.valuation.upswitch.app/api/valuations/r1/review'
    )
    const response = await proxyTitanReviewJsonRoute(
      request,
      'https://api-staging.upswitch.app/api/v2/valuations/r1/review',
      { method: 'GET' },
      { defaultErrorMessage: 'Failed to load review state' }
    )
    const json = await response.json()

    expect(response.status).toBe(504)
    expect(json).toEqual({
      success: false,
      message: 'The valuation service is temporarily busy. Please try again in a moment.',
    })
  })
})
