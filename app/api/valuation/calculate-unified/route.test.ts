/**
 * Pass-through smoke test for the calc BFF route.
 *
 * The route forwards Titan's status and body verbatim — including the
 * structured 422/503 envelopes with `code: 'BENCHMARK_CONTRACT_REQUIRED'`
 * that the Venus error converter reads. This test pins that contract so
 * a future refactor of the route can't silently swallow the structured
 * shape (the kind of regression that re-creates the original "Request
 * failed with status code 499" symptom).
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

// The route uses the global `fetch` — stub it. We don't need to mock
// any auth helpers because the route inlines the cookie-extraction logic.
vi.stubGlobal('fetch', mocks.fetch)

vi.mock('@/utils/auth/cookieHeader', () => ({
  getTitanAccessTokenFromCookieHeader: vi.fn(() => 'fake-token'),
}))

function makeRequest(body: unknown = { company_name: 'Restaurant AB' }) {
  return new NextRequest('https://valuation.upswitch.app/api/valuation/calculate-unified', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mocks.fetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/valuation/calculate-unified — error pass-through', () => {
  it('forwards Titan 422 + BENCHMARK_CONTRACT_REQUIRED body unchanged', async () => {
    const titanBody = {
      statusCode: 422,
      code: 'BENCHMARK_CONTRACT_REQUIRED',
      message: 'A business type is required.',
      country_code: 'BE',
      reason: 'missing_business_type_id',
    }
    mocks.fetch.mockResolvedValueOnce(jsonResponse(422, titanBody))

    const { POST } = await import('./route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual(titanBody)
  })

  it('forwards Titan 503 with structured code (python-tunneled-through)', async () => {
    const titanBody = {
      statusCode: 503,
      code: 'BENCHMARK_CONTRACT_REQUIRED',
      message:
        'Valuation calculation failed: Resolved benchmark contract required for multiples valuation.',
      error_type: 'MultiplesCalculationError',
    }
    mocks.fetch.mockResolvedValueOnce(jsonResponse(503, titanBody))

    const { POST } = await import('./route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('BENCHMARK_CONTRACT_REQUIRED')
    expect(body.error_type).toBe('MultiplesCalculationError')
    expect(body.message).toMatch(/Resolved benchmark contract/)
  })

  it('forwards Titan 200 success unchanged', async () => {
    const titanBody = { valuation_id: 'val_123', equity_value_mid: 1_000_000 }
    mocks.fetch.mockResolvedValueOnce(jsonResponse(200, titanBody))

    const { POST } = await import('./route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(titanBody)
  })

  it('falls back to PARSE_ERROR shape when Titan returns malformed JSON, but preserves status', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response('not json at all', { status: 422, headers: { 'Content-Type': 'text/plain' } })
    )

    const { POST } = await import('./route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('PARSE_ERROR')
  })

  it('returns 400 for missing/invalid request body without calling Titan', async () => {
    const { POST } = await import('./route')
    const req = new NextRequest('https://valuation.upswitch.app/api/valuation/calculate-unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('returns 504 when Titan stalls after response headers', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    mocks.fetch.mockImplementationOnce((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? null
      return Promise.resolve({
        status: 200,
        headers: new Headers(),
        json: vi.fn(
          () =>
            new Promise((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            })
        ),
      } as unknown as Response)
    })

    const { POST } = await import('./route')
    const responsePromise = POST(makeRequest())
    await Promise.resolve()
    await Promise.resolve()

    const assertion = expect(responsePromise.then((response) => response.status)).resolves.toBe(504)
    await vi.advanceTimersByTimeAsync(60_001)

    await assertion
  })

  it('returns 502 when Titan is unreachable before headers', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { POST } = await import('./route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE')
  })
})
