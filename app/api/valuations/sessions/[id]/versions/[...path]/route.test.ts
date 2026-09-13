import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'

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

describe('/api/valuations/sessions/[id]/versions/[...path]', () => {
  it('forwards the same restore operation identifier to Titan', async () => {
    await POST(
      new NextRequest(
        'https://valuation.upswitch.app/api/valuations/sessions/report-a/versions/1/restore',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'restore-operation-123' },
          body: '{}',
        }
      ),
      { params: Promise.resolve({ id: 'report-a', path: ['1', 'restore'] }) }
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/versions/1/restore'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'restore-operation-123' }),
      })
    )
  })
  it('encodes session ids and sub-route segments before proxying to Titan', async () => {
    const response = await GET(
      new NextRequest(
        'https://valuation.upswitch.app/api/valuations/sessions/session/versions/compare'
      ),
      {
        params: Promise.resolve({
          id: 'session/with spaces',
          path: ['compare/version one'],
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v2/valuations/sessions/session%2Fwith%20spaces/versions/compare%2Fversion%20one'
      ),
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
      })
    )
  })
})
