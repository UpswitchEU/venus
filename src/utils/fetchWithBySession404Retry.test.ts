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

  it('short-circuits the retry cascade when the 404 body marks transient: false', async () => {
    // Titan tags permanent misses (deleted, access denied, no session row)
    // with ``transient: false``. The cascade must skip retries —
    // otherwise every navigation to a deleted report wastes ~6.9s
    // (sum of BY_SESSION_404_BACKOFF_MS) on useless retries.
    const f = global.fetch as ReturnType<typeof vi.fn>
    const body = JSON.stringify({
      message: 'Report has been deleted',
      reason: 'deleted',
      transient: false,
    })
    const make404 = () => ({
      ok: false,
      status: 404,
      clone() {
        return { text: async () => body }
      },
    })
    f.mockResolvedValueOnce(make404())

    const r = await fetchWithBySession404Retry(bySessionUrl, { method: 'GET' })
    expect(r.status).toBe(404)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('still retries when 404 body marks transient: true (session pending report link)', async () => {
    vi.useFakeTimers()
    const f = global.fetch as ReturnType<typeof vi.fn>
    const transientBody = JSON.stringify({
      reason: 'session_pending_report_link',
      transient: true,
    })
    const make404 = () => ({
      ok: false,
      status: 404,
      clone() {
        return { text: async () => transientBody }
      },
    })
    f.mockResolvedValueOnce(make404())
    f.mockResolvedValueOnce({ ok: true, status: 200, clone: () => ({ text: async () => '' }) })

    const promise = fetchWithBySession404Retry(bySessionUrl, { method: 'GET' })
    await vi.advanceTimersByTimeAsync(500)
    const r = await promise
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('retries on 404 with no body (legacy fallback — absent transient flag means keep retrying)', async () => {
    vi.useFakeTimers()
    const f = global.fetch as ReturnType<typeof vi.fn>
    const make404 = () => ({
      ok: false,
      status: 404,
      clone() {
        return { text: async () => '' }
      },
    })
    f.mockResolvedValueOnce(make404())
    f.mockResolvedValueOnce({ ok: true, status: 200, clone: () => ({ text: async () => '' }) })

    const promise = fetchWithBySession404Retry(bySessionUrl, { method: 'GET' })
    await vi.advanceTimersByTimeAsync(500)
    const r = await promise
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })
})
