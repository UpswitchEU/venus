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

function request(entityId = '3e28d49d-5474-4a27-8065-3a87b5973075') {
  return new NextRequest(`https://valuation.upswitch.app/api/buyer-ready/room/${entityId}`, {
    headers: { cookie: 'upswitch_access_token=token' },
  })
}

function titanResult(status: number, json: unknown) {
  return {
    response: new Response(JSON.stringify(json), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
    json,
  }
}

describe('GET /api/buyer-ready/room/[entityId]', () => {
  beforeEach(() => {
    mocks.fetchJsonWithTimeout.mockReset()
    mocks.getBffCookieHeaderForTitan.mockReset()
    mocks.getTitanApiUrl.mockClear()
    mocks.getTitanApiUrl.mockReturnValue('https://api.upswitch.app')
    mocks.getBffCookieHeaderForTitan.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=token',
      cookieSource: 'header',
    })
  })

  it('keeps the room response available when an optional Titan detail read aborts', async () => {
    const abortError = new Error('signal is aborted without reason')
    abortError.name = 'AbortError'

    mocks.fetchJsonWithTimeout.mockImplementation(async (url: string) => {
      if (url.includes('/package')) {
        return titanResult(200, {
          success: true,
          data: {
            entityId: '3e28d49d-5474-4a27-8065-3a87b5973075',
            buyerReadiness: { status: 'ready' },
          },
        })
      }
      if (url.includes('/buyer-ready/im/')) {
        throw abortError
      }
      if (url.includes('/readiness-cases')) {
        return titanResult(200, { success: true, data: [] })
      }
      return titanResult(200, { success: true, data: null })
    })

    const response = await GET(request(), {
      params: Promise.resolve({ entityId: '3e28d49d-5474-4a27-8065-3a87b5973075' }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.package).toEqual({
      entityId: '3e28d49d-5474-4a27-8065-3a87b5973075',
      buyerReadiness: { status: 'ready' },
    })
    expect(json.data.im).toBeNull()
    expect(json.data.partialFailures).toEqual(['im:504'])
  })
})
