import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET } from './route'

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

  it('forwards DELETE proposal bodies and advisor client-context headers', async () => {
    const response = await DELETE(
      new NextRequest(
        'https://valuation.upswitch.app/api/normalization/session-123/rejections/618000',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-User-Id': 'client-user-1',
            'X-Accountant-User-Id': 'advisor-user-1',
          },
          body: JSON.stringify({
            fiscal_year: 2025,
            amount: 120000,
            source_ref: '2025:618000',
            scope: 'client',
          }),
        }
      ),
      {
        params: Promise.resolve({ path: ['session-123', 'rejections', '618000'] }),
      }
    )

    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/normalization/session-123/rejections/618000'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          fiscal_year: 2025,
          amount: 120000,
          source_ref: '2025:618000',
          scope: 'client',
        }),
        headers: expect.objectContaining({
          'X-Client-User-Id': 'client-user-1',
          'X-Accountant-User-Id': 'advisor-user-1',
        }),
      })
    )
  })
})
