'use client'

/**
 * useStartupBenchmark
 * -------------------
 *
 * Client hook used by the Studio v2 wizard to read the
 * region × stage × sector reference numbers (Berkus cap, exit-multiple
 * range, target ROI, dilution baseline, regional pre-money median).
 *
 * Backed by the Venus proxy `/api/startup-benchmarks`, which itself
 * proxies to Athena's `/api/benchmarks/v1/startup-reference`.  Both
 * sides have a static Q1 2026 fallback so the wizard always renders
 * a credible baseline even if Athena (or the database) is unreachable.
 *
 * Why a hand-rolled hook instead of SWR? Venus does not currently
 * depend on SWR or react-query; this single endpoint does not justify
 * pulling in a new dep.  The cache is keyed in module-level memory and
 * the API route already sets `s-maxage` headers for the CDN.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  getRegionalBaseline,
  type StartupRegionalBaseline,
} from '@/components/calculator/sections/startup/regionalBaseline'
import type { StartupSector, StartupStage } from '@/store/manual/useStartupValuationStore'

export interface StartupBenchmarkRow {
  region_code: string
  stage: StartupStage
  sector: StartupSector
  average_pre_money_eur: number
  berkus_max_per_milestone_eur: number
  exit_multiple_low: number
  exit_multiple_high: number
  default_target_roi_x: number
  default_dilution_pct: number
  default_yoy_growth_factor: number
  source: string
  methodology_version: string
  published_at: string
}

export interface UseStartupBenchmarkResult {
  /** Resolved benchmark for the supplied (country, stage, sector). */
  benchmark: StartupBenchmarkRow
  /** True until the first network response (or fallback) returns. */
  isLoading: boolean
  /** True when we are showing the static `regionalBaseline.ts` fallback. */
  isFallback: boolean
  /** The raw `published_at` of the row (useful for "Updated quarterly" badge). */
  publishedAt: string
}

/** Module-level cache (per (country|stage|sector) key) — wiped on full reload. */
const cache = new Map<string, StartupBenchmarkRow>()
const inflight = new Map<string, Promise<StartupBenchmarkRow | null>>()

function cacheKey(country: string, stage: StartupStage, sector: StartupSector) {
  return `${country.toUpperCase()}|${stage}|${sector}`
}

function rowFromBaseline(
  baseline: StartupRegionalBaseline,
  sector: StartupSector
): StartupBenchmarkRow {
  return {
    region_code: baseline.region_code,
    stage: baseline.stage,
    sector,
    average_pre_money_eur: baseline.average_pre_money,
    berkus_max_per_milestone_eur: baseline.max_per_milestone,
    // Conservative range around the static mid-multiple.
    exit_multiple_low: Math.max(2, baseline.comparable_exit_revenue_multiple - 1),
    exit_multiple_high: baseline.comparable_exit_revenue_multiple + 2,
    default_target_roi_x: baseline.default_target_roi_x,
    default_dilution_pct: baseline.default_dilution_pct,
    default_yoy_growth_factor: 3.0,
    source: 'Venus regionalBaseline.ts (offline)',
    methodology_version: 'studio-v2-offline',
    published_at: '2025-01-01T00:00:00Z',
  }
}

async function fetchBenchmarkRow(
  country: string,
  stage: StartupStage,
  sector: StartupSector
): Promise<StartupBenchmarkRow | null> {
  const params = new URLSearchParams({ region: country, stage, sector })
  try {
    const res = await fetch(`/api/startup-benchmarks?${params.toString()}`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { rows?: unknown[] }
    const row = Array.isArray(data.rows) ? (data.rows[0] as StartupBenchmarkRow) : null
    if (!row) return null
    // Coerce string-y numerics returned by Postgres NUMERIC.
    return {
      ...row,
      average_pre_money_eur: Number(row.average_pre_money_eur),
      berkus_max_per_milestone_eur: Number(row.berkus_max_per_milestone_eur),
      exit_multiple_low: Number(row.exit_multiple_low),
      exit_multiple_high: Number(row.exit_multiple_high),
      default_target_roi_x: Number(row.default_target_roi_x),
      default_dilution_pct: Number(row.default_dilution_pct),
      default_yoy_growth_factor: Number(row.default_yoy_growth_factor),
    }
  } catch {
    return null
  }
}

export function useStartupBenchmark(
  countryCode: string,
  stage: StartupStage,
  sector: StartupSector,
  enabled = true
): UseStartupBenchmarkResult {
  const country = (countryCode || 'BE').toUpperCase()
  const key = cacheKey(country, stage, sector)
  const cached = cache.get(key)
  const fallbackRow = useMemo(
    () => rowFromBaseline(getRegionalBaseline(country, stage), sector),
    [country, stage, sector]
  )

  const [state, setState] = useState<{
    key: string
    row: StartupBenchmarkRow
    loading: boolean
    fallback: boolean
  }>(() => ({
    key,
    row: cached ?? fallbackRow,
    loading: enabled && !cached,
    fallback: !cached,
  }))

  useEffect(() => {
    if (!enabled) {
      setState({ key, row: fallbackRow, loading: false, fallback: true })
      return
    }
    const cachedRow = cache.get(key)
    if (cachedRow) {
      setState({ key, row: cachedRow, loading: false, fallback: false })
      return
    }
    let active = true
    setState({ key, row: fallbackRow, loading: true, fallback: true })
    const inflightPromise = inflight.get(key) ?? fetchBenchmarkRow(country, stage, sector)
    inflight.set(key, inflightPromise)
    inflightPromise
      .then((row) => {
        inflight.delete(key)
        if (!active) return
        if (row) {
          cache.set(key, row)
          setState({ key, row, loading: false, fallback: false })
        } else {
          setState({ key, row: fallbackRow, loading: false, fallback: true })
        }
      })
      .catch(() => {
        inflight.delete(key)
        if (!active) return
        setState({ key, row: fallbackRow, loading: false, fallback: true })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, country, fallbackRow, sector, stage])

  const currentState =
    state.key === key
      ? state
      : {
          key,
          row: cached ?? fallbackRow,
          loading: enabled && !cached,
          fallback: !cached,
        }

  return {
    benchmark: currentState.row,
    isLoading: currentState.loading,
    isFallback: currentState.fallback,
    publishedAt: currentState.row.published_at,
  }
}
