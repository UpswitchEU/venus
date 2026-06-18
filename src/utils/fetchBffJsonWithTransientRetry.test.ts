import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS,
  fetchBffJsonWithTransientRetry,
  shouldRetryBffJsonResult,
} from './fetchBffJsonWithTransientRetry'

describe('fetchBffJsonWithTransientRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns immediately on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { reviewState: 'auto_generated' } }), {
        status: 200,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBffJsonWithTransientRetry('/api/valuations/r1/review')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.res.status).toBe(200)
    expect(result.json).toEqual({ success: true, data: { reviewState: 'auto_generated' } })
  })

  it('retries transient upstream failures with backoff', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls < 3) {
        return new Response(JSON.stringify({ success: false }), { status: 503 })
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchBffJsonWithTransientRetry('/api/valuations/r1/review/approve', {
      method: 'POST',
    })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(calls).toBe(3)
    expect(result.res.status).toBe(200)
    vi.useRealTimers()
  })

  it('does not retry permanent client errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: 'Forbidden' }), { status: 403 })
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBffJsonWithTransientRetry('/api/valuations/r1/review/approve', {
      method: 'POST',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.res.status).toBe(403)
  })

  it('classifies transient upstream statuses consistently with PDF helpers', () => {
    expect(shouldRetryBffJsonResult(new Response(null, { status: 503 }), {})).toBe(true)
    expect(shouldRetryBffJsonResult(new Response(null, { status: 504 }), {})).toBe(true)
    expect(shouldRetryBffJsonResult(new Response(null, { status: 403 }), {})).toBe(false)
  })

  it('exports a default retry profile aligned with the BFF timeout budget', () => {
    expect(DEFAULT_BFF_TRANSIENT_RETRY_OPTIONS).toEqual({
      maxAttempts: 3,
      initialDelayMs: 1_000,
      maxDelayMs: 4_000,
      timeoutMs: 40_000,
    })
  })
})
