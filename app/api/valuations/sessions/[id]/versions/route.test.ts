import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, versions: [] }), {
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

describe('/api/valuations/sessions/[id]/versions', () => {
  it('encodes session ids before proxying to Titan', async () => {
    const response = await GET(
      new NextRequest('https://valuation.upswitch.app/api/valuations/sessions/session/versions'),
      {
        params: Promise.resolve({ id: 'session/with spaces' }),
      }
    )

    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/valuations/sessions/session%2Fwith%20spaces/versions'),
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      })
    )
  })
})
