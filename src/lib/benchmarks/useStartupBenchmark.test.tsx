/**
 * useStartupBenchmark hook — fallback contract.
 *
 * The Studio v2 wizard renders against `useStartupBenchmark`. The contract
 * we never want to break:
 *
 *   1. **First render is synchronous** — the offline `regionalBaseline.ts`
 *      mirror always seeds a fully-shaped row so the wizard never flashes
 *      "—" or NaN before the network resolves.
 *   2. **Network failure is invisible** — when `/api/startup-benchmarks`
 *      throws or returns an empty payload, the hook keeps the offline
 *      baseline and flips `isFallback` so the LiveReceipt can show an
 *      "Offline numbers" badge.
 *   3. **A successful network response upgrades the row** in place and
 *      flips `isFallback` back to false.
 *
 * Anything else would silently degrade founder confidence in the live
 * pre-money number.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStartupBenchmark } from './useStartupBenchmark'

describe('useStartupBenchmark', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('synchronously returns the offline baseline before fetch resolves', () => {
    // Stub fetch with a never-resolving promise so the first render is
    // guaranteed to be the synchronous baseline.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )

    const { result } = renderHook(() => useStartupBenchmark('BE', 'seed', 'saas'))

    expect(result.current.benchmark.region_code).toBe('BE')
    expect(result.current.benchmark.stage).toBe('seed')
    expect(result.current.benchmark.sector).toBe('saas')
    expect(result.current.benchmark.average_pre_money_eur).toBeGreaterThan(0)
    expect(result.current.benchmark.berkus_max_per_milestone_eur).toBeGreaterThan(0)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isFallback).toBe(true)
  })

  it('keeps the offline baseline when fetch rejects (Athena down)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network blip'))),
    )

    const { result } = renderHook(() => useStartupBenchmark('NL', 'pre_seed', 'fintech'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isFallback).toBe(true)
    expect(result.current.benchmark.region_code).toBe('NL')
    expect(result.current.benchmark.stage).toBe('pre_seed')
    // Sector is enriched from the offline baseline regardless of fetch state.
    expect(result.current.benchmark.sector).toBe('fintech')
    expect(result.current.benchmark.average_pre_money_eur).toBeGreaterThan(0)
  })

  it('upgrades to the live row when fetch returns a valid payload', async () => {
    // Use a unique (region, stage, sector) triple — the hook keeps a
    // module-level `cache` + `inflight` map that survives test boundaries
    // (vi.resetModules() does not reset already-imported module state).
    // Fresh keys keep the tests order-independent.
    const liveRow = {
      region_code: 'LU',
      stage: 'series_a',
      sector: 'deeptech_ai',
      average_pre_money_eur: '21000000',
      berkus_max_per_milestone_eur: '950000',
      exit_multiple_low: '7',
      exit_multiple_high: '14',
      default_target_roi_x: '10',
      default_dilution_pct: '45',
      default_yoy_growth_factor: '2.8',
      source: 'PitchBook Q1 2026',
      methodology_version: 'studio-v2-2026q1',
      published_at: '2026-04-01T00:00:00Z',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ rows: [liveRow] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    )

    const { result } = renderHook(() =>
      useStartupBenchmark('LU', 'series_a', 'deeptech_ai'),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isFallback).toBe(false)
    expect(result.current.benchmark.average_pre_money_eur).toBe(21_000_000)
    expect(result.current.benchmark.exit_multiple_low).toBe(7)
    expect(result.current.benchmark.exit_multiple_high).toBe(14)
    expect(result.current.benchmark.source).toBe('PitchBook Q1 2026')
  })
})
