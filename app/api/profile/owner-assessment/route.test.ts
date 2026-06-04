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

import { GET, PUT } from './route'

function titanJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function request(method: 'GET' | 'PUT', body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('https://valuation.upswitch.app/api/profile/owner-assessment', {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('/api/profile/owner-assessment', () => {
  beforeEach(() => {
    mocks.fetchWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
  })

  it('PUT proxies owner-profile answers with auth and agent action headers', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
      cookieSource: 'both',
    })
    mocks.fetchWithTimeout.mockResolvedValue(
      titanJsonResponse(200, { id: 'assessment-1', ownerHoursPerWeek: 45 })
    )

    const res = await PUT(
      request(
        'PUT',
        { ownerHoursPerWeek: 45 },
        {
          'X-Upswitch-Agent-Tool-Name': 'update_owner_profile_answer',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-1',
        }
      )
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      data: { id: 'assessment-1', ownerHoursPerWeek: 45 },
      message: 'Owner profile assessment saved',
    })
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.upswitch.app/api/v2/owner-profile-assessment',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer jwt-token',
          Cookie: 'upswitch_access_token=jwt-token; upswitch_refresh_token=refresh-token',
          'X-Upswitch-Agent-Tool-Name': 'update_owner_profile_answer',
          'X-Upswitch-Agent-Proposal-Id': 'proposal-1',
        },
        body: JSON.stringify({ ownerHoursPerWeek: 45 }),
      },
      15_000
    )
  })

  it('GET rejects unauthenticated requests before hitting Titan', async () => {
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: '',
      cookieSource: 'header',
    })

    const res = await GET(request('GET'))

    expect(res.status).toBe(401)
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
  })
})
