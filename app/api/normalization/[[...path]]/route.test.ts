import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('/api/normalization/[[...path]]', () => {
  it('encodes catch-all path segments before proxying to Titan', async () => {
    const response = await GET(
      new NextRequest('https://valuation.upswitch.app/api/normalization/session/2024?locale=nl'),
      {
        params: Promise.resolve({ path: ['session/with spaces', '2024'] }),
      }
    )

    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/normalization/session%2Fwith%20spaces/2024?locale=nl'),
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      })
    )
  })
})
