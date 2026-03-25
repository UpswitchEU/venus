import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isBySessionReportUrl } from '../constants/reportBySessionRetry'
import { fetchWithBySession404Retry } from './fetchWithBySession404Retry'

describe('isBySessionReportUrl', () => {
  it('detects Titan v2 by-session report URLs', () => {
    expect(
      isBySessionReportUrl('https://api.example.com/api/v2/valuations/reports/by-session/sess_abc')
    ).toBe(true)
  })

  it('does not match direct report UUID routes', () => {
    expect(
      isBySessionReportUrl(
        'https://api.example.com/api/v2/valuations/reports/550e8400-e29b-41d4-a716-446655440000'
      )
    ).toBe(false)
  })
})

describe('fetchWithBySession404Retry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const bySessionUrl = 'https://api.example.com/api/v2/valuations/reports/by-session/sess_abc123'

  it('retries on 404 for by-session URL then returns the successful response', async () => {
    vi.useFakeTimers()
    const f = global.fetch as ReturnType<typeof vi.fn>
    f.mockResolvedValueOnce({ ok: false, status: 404 })
    f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    const promise = fetchWithBySession404Retry(bySessionUrl, { method: 'GET' })
    await vi.advanceTimersByTimeAsync(500)
    const r = await promise
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('does not retry UUID report URLs on 404', async () => {
    const f = global.fetch as ReturnType<typeof vi.fn>
    f.mockResolvedValueOnce({ ok: false, status: 404 })

    const r = await fetchWithBySession404Retry(
      'https://api.example.com/api/v2/valuations/reports/550e8400-e29b-41d4-a716-446655440000',
      { method: 'GET' }
    )
    expect(r.status).toBe(404)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
