import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getTitanApiUrl: vi.fn(() => 'https://api.upswitch.app'),
}))

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: async (...args: unknown[]) => {
    const response = (await mocks.fetchWithTimeout(...args)) as Response
    return { response, json: await response.json().catch(() => null) }
  },
}))

vi.mock('@/utils/getTitanApiUrl', () => ({
  getTitanApiUrl: mocks.getTitanApiUrl,
}))

import { GET } from './route'

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://valuation.upswitch.app/api/jobs/job-1', {
    headers,
  })
}

function params(jobId: string) {
  return { params: Promise.resolve({ jobId }) }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetchWithTimeout.mockReset()
  mocks.getTitanApiUrl.mockClear()
  mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
})

describe('/api/jobs/[jobId]', () => {
  it('requires an access cookie before calling Titan', async () => {
    const response = await GET(request(), params('job-1'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Authentication required',
    })
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('encodes job ids and forwards the Titan response body', async () => {
    mocks.fetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, { status: 'completed', result: { revenue: 1000 } })
    )

    const response = await GET(
      request({ cookie: 'upswitch_access_token=jwt-token' }),
      params('job/with spaces')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'completed', result: { revenue: 1000 } })
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/jobs/job%2Fwith%20spaces',
      {
        method: 'GET',
        headers: {
          Cookie: 'upswitch_access_token=jwt-token',
        },
      },
      15_000
    )
  })

  it('maps upstream timeouts to 504', async () => {
    mocks.fetchWithTimeout.mockRejectedValueOnce(new Error('Request timeout - please try again'))

    const response = await GET(
      request({ cookie: 'upswitch_access_token=jwt-token' }),
      params('job-1')
    )

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Job status request timed out',
    })
  })

  it('maps upstream network failures to 502', async () => {
    mocks.fetchWithTimeout.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const response = await GET(
      request({ cookie: 'upswitch_access_token=jwt-token' }),
      params('job-1')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Job service unavailable',
    })
  })
})
