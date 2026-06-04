import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('https://valuation.upswitch.app/api/orchestration/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'upswitch_access_token=jwt-token',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function params(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

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

describe('/api/orchestration/[...path]', () => {
  it('rejects unauthenticated requests before calling Titan', async () => {
    const response = await POST(
      request({ field: 'companyName' }, { cookie: 'upswitch_refresh_token=refresh-only' }),
      params(['validate'])
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Authentication required',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards JSON requests to the matching Titan orchestration path', async () => {
    const response = await POST(request({ field: 'companyName' }), params(['validate']))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(fetch).toHaveBeenCalledWith('http://localhost:3002/api/v2/orchestration/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-token',
        Cookie: 'upswitch_access_token=jwt-token',
      },
      body: JSON.stringify({ field: 'companyName' }),
      signal: expect.any(AbortSignal),
    })
  })

  it('returns 504 when a non-streaming body stalls after headers arrive', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: vi.fn(
          () =>
            new Promise(() => {
              // Intentionally never resolves; the response-body timeout must win.
            })
        ),
      } as unknown as Response)
    )

    const responsePromise = POST(request({ field: 'companyName' }), params(['validate']))
    await Promise.resolve()
    await Promise.resolve()

    const assertion = expect(responsePromise.then((response) => response.status)).resolves.toBe(504)
    await vi.advanceTimersByTimeAsync(15_001)

    await assertion
  })
})
