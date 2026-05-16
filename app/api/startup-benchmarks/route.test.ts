/**
 * Athena startup-benchmarks proxy — contract tests.
 *
 * The Studio v2 wizard, the legacy `StartupValuationPanel`, and the
 * Q1 2026 marketing page all consume this endpoint via
 * `useStartupBenchmark`. The shape of every row is treated as a stable
 * cross-app contract — break it and the founder-facing valuation stops
 * computing.
 *
 * What we pin down here:
 *   1. **No API key configured** → falls back to the static Q1 2026
 *      payload (never throws), so local dev / preview branches keep
 *      working without secrets.
 *   2. **Athena unreachable** → falls back to the same static payload
 *      with a `warning` string so the client can surface "stale data"
 *      affordances if it wants to.
 *   3. **Filters** (`region`, `stage`, `sector`) actually narrow the
 *      result set — the client treats the first row as canonical, so
 *      mis-filtering would silently render the wrong baseline.
 *   4. Each row exposes the **canonical numeric fields** the Studio
 *      depends on (`berkus_max_per_milestone_eur`, `exit_multiple_low`,
 *      `default_target_roi_x`, `default_dilution_pct`, …).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  generalLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { GET } from './route'

const mockedFetch = fetchWithTimeout as unknown as ReturnType<typeof vi.fn>

function makeRequest(query: string): Request {
  return new Request(`https://valuation.upswitch.app/api/startup-benchmarks?${query}`)
}

describe('GET /api/startup-benchmarks', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    mockedFetch.mockReset()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns the static fallback when ATHENA_BENCHMARK_API_KEY is missing', async () => {
    delete process.env.ATHENA_BENCHMARK_API_KEY

    const res = await GET(makeRequest('region=BE&stage=seed&sector=saas') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.source).toBe('venus-static-fallback')
    expect(Array.isArray(body.rows)).toBe(true)
    expect(body.rows.length).toBeGreaterThan(0)

    const row = body.rows[0]
    expect(row.region_code).toBe('BE')
    expect(row.stage).toBe('seed')
    expect(row.sector).toBe('saas')

    // Numeric contract — every field the Studio reads must be a finite
    // number, not a Postgres-style string.
    for (const key of [
      'average_pre_money_eur',
      'berkus_max_per_milestone_eur',
      'exit_multiple_low',
      'exit_multiple_high',
      'default_target_roi_x',
      'default_dilution_pct',
      'default_yoy_growth_factor',
    ]) {
      expect(typeof row[key]).toBe('number')
      expect(Number.isFinite(row[key])).toBe(true)
    }
  })

  it('falls back to static rows + warning when Athena is unreachable', async () => {
    process.env.ATHENA_BENCHMARK_API_KEY = 'test-key'
    mockedFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await GET(makeRequest('region=BE&stage=pre_seed&sector=fintech') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.source).toBe('venus-static-fallback')
    expect(typeof body.warning).toBe('string')
    expect(body.rows[0].sector).toBe('fintech')
  })

  it('forwards a clean upstream payload from Athena verbatim', async () => {
    process.env.ATHENA_BENCHMARK_API_KEY = 'test-key'
    const upstream = {
      rows: [
        {
          region_code: 'BE',
          stage: 'seed',
          sector: 'saas',
          average_pre_money_eur: 5_500_000,
          berkus_max_per_milestone_eur: 700_000,
          exit_multiple_low: 5,
          exit_multiple_high: 10,
          default_target_roi_x: 25,
          default_dilution_pct: 22,
          default_yoy_growth_factor: 3.2,
          source: 'Athena MDM',
          methodology_version: 'studio-v2-2026q1',
          published_at: '2026-04-01T00:00:00Z',
        },
      ],
      source: 'athena-live',
    }
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => upstream,
    })

    const res = await GET(makeRequest('region=BE&stage=seed&sector=saas') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.source).toBe('athena-live')
    expect(body.rows[0].published_at).toBe('2026-04-01T00:00:00Z')
  })

  it('falls back when Athena returns a non-2xx status', async () => {
    process.env.ATHENA_BENCHMARK_API_KEY = 'test-key'
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    })

    const res = await GET(makeRequest('region=BE') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.source).toBe('venus-static-fallback')
    expect(body.warning).toContain('503')
  })

  it('respects the stage + sector filter when narrowing the static payload', async () => {
    delete process.env.ATHENA_BENCHMARK_API_KEY

    const res = await GET(makeRequest('region=BE&stage=series_a&sector=deeptech_ai') as never)
    const body = await res.json()

    expect(body.rows.length).toBe(1)
    expect(body.rows[0].stage).toBe('series_a')
    expect(body.rows[0].sector).toBe('deeptech_ai')
    // Series A baselines are materially larger than pre-seed — keeps
    // accidental field-mapping regressions visible.
    expect(body.rows[0].average_pre_money_eur).toBeGreaterThan(5_000_000)
  })
})
