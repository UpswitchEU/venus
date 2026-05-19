/**
 * Startup-valuation benchmark proxy
 *
 * Server-side proxy from Venus to Athena's
 * `/api/benchmarks/v1/startup-reference` endpoint.  Keeps the
 * `BENCHMARK_API_KEYS` secret server-side and lets the client hook
 * (`useStartupBenchmark`) talk to a same-origin URL.
 *
 * Falls back to a static Q1 2026 payload when Athena is unreachable so
 * the Studio wizard always renders something credible.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { generalLogger } from '@/utils/logger'

const TIMEOUT_MS = 4_000

const ATHENA_BASE_URL =
  process.env.ATHENA_API_BASE_URL ||
  process.env.NEXT_PUBLIC_ATHENA_BASE_URL ||
  'https://athena.upswitch.app'

/** Static Q1 2026 fallback (mirrors the Athena route's static payload). */
const STATIC_ROWS = [
  ['BE', 'pre_seed', 'saas', 1500000, 600000, 4, 8, 30, 60, 3.0],
  ['BE', 'pre_seed', 'fintech', 1700000, 600000, 6, 10, 30, 60, 3.5],
  ['BE', 'pre_seed', 'marketplace', 1400000, 600000, 3, 6, 30, 60, 3.0],
  ['BE', 'pre_seed', 'biotech_healthtech', 1800000, 600000, 6, 12, 30, 60, 2.5],
  ['BE', 'pre_seed', 'deeptech_ai', 1900000, 600000, 6, 12, 30, 60, 3.0],
  ['BE', 'pre_seed', 'vertical_ai', 2500000, 600000, 7, 13, 30, 60, 3.5],
  ['BE', 'pre_seed', 'consumer', 1300000, 600000, 2, 4, 30, 60, 2.5],
  ['BE', 'pre_seed', 'hardware', 1400000, 600000, 2, 4, 30, 60, 2.5],
  ['BE', 'pre_seed', 'other', 1500000, 600000, 4, 7, 30, 60, 2.5],
  ['BE', 'seed', 'saas', 5000000, 600000, 5, 9, 20, 55, 3.0],
  ['BE', 'seed', 'fintech', 5800000, 600000, 6, 11, 20, 55, 3.5],
  ['BE', 'seed', 'marketplace', 4500000, 600000, 4, 7, 20, 55, 3.0],
  ['BE', 'seed', 'biotech_healthtech', 6200000, 600000, 7, 13, 20, 55, 2.5],
  ['BE', 'seed', 'deeptech_ai', 6500000, 600000, 7, 13, 20, 55, 3.0],
  ['BE', 'seed', 'vertical_ai', 8500000, 600000, 8, 14, 20, 55, 3.5],
  ['BE', 'seed', 'consumer', 4000000, 600000, 3, 5, 20, 55, 2.5],
  ['BE', 'seed', 'hardware', 4200000, 600000, 3, 5, 20, 55, 2.5],
  ['BE', 'seed', 'other', 4800000, 600000, 5, 8, 20, 55, 2.5],
  ['BE', 'series_a', 'saas', 15000000, 900000, 6, 10, 10, 45, 2.5],
  ['BE', 'series_a', 'fintech', 17000000, 900000, 7, 12, 10, 45, 3.0],
  ['BE', 'series_a', 'marketplace', 13000000, 900000, 5, 8, 10, 45, 2.5],
  ['BE', 'series_a', 'biotech_healthtech', 18000000, 900000, 7, 14, 10, 45, 2.0],
  ['BE', 'series_a', 'deeptech_ai', 19000000, 900000, 7, 14, 10, 45, 2.5],
  ['BE', 'series_a', 'vertical_ai', 25000000, 900000, 9, 15, 10, 45, 3.0],
  ['BE', 'series_a', 'consumer', 12000000, 900000, 3, 6, 10, 45, 2.0],
  ['BE', 'series_a', 'hardware', 12500000, 900000, 3, 6, 10, 45, 2.0],
  ['BE', 'series_a', 'other', 14000000, 900000, 5, 9, 10, 45, 2.0],
] as const

function staticRows(region: string | null, stage: string | null, sector: string | null) {
  const regions = region ? [region] : ['BE', 'NL', 'LU']
  return regions.flatMap((r) =>
    STATIC_ROWS.map(([_, s, sec, prem, ber, mlow, mhigh, roi, dil, growth]) => ({
      region_code: r,
      stage: s,
      sector: sec,
      average_pre_money_eur: prem,
      berkus_max_per_milestone_eur: ber,
      exit_multiple_low: mlow,
      exit_multiple_high: mhigh,
      default_target_roi_x: roi,
      default_dilution_pct: dil,
      default_yoy_growth_factor: growth,
      source: 'Venus static fallback (Q1 2026)',
      methodology_version: 'studio-v2-2026q1-fallback',
      published_at: '2026-01-01T00:00:00Z',
    })).filter((row) => (!stage || row.stage === stage) && (!sector || row.sector === sector))
  )
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const region = url.searchParams.get('region')?.toUpperCase() || null
  const stage = url.searchParams.get('stage')?.toLowerCase() || null
  const sector = url.searchParams.get('sector')?.toLowerCase() || null

  const apiKey = process.env.ATHENA_BENCHMARK_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        rows: staticRows(region, stage, sector),
        source: 'venus-static-fallback',
        warning: 'ATHENA_BENCHMARK_API_KEY not configured — using static Q1 2026 numbers.',
      },
      { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' } }
    )
  }

  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (stage) params.set('stage', stage)
  if (sector) params.set('sector', sector)
  const target = `${ATHENA_BASE_URL}/api/benchmarks/v1/startup-reference?${params.toString()}`

  try {
    const res = await fetchWithTimeout(
      target,
      { headers: { 'x-api-key': apiKey, accept: 'application/json' } },
      TIMEOUT_MS
    )
    if (!res.ok) {
      generalLogger.warn('[startup-benchmarks] Athena non-2xx', { status: res.status })
      return NextResponse.json(
        {
          rows: staticRows(region, stage, sector),
          source: 'venus-static-fallback',
          warning: `Athena returned ${res.status}`,
        },
        { headers: { 'cache-control': 'public, s-maxage=60' } }
      )
    }
    const json = (await res.json()) as { rows?: unknown[]; source?: string }
    return NextResponse.json(json, {
      headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' },
    })
  } catch (error) {
    generalLogger.warn('[startup-benchmarks] Athena unreachable', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      {
        rows: staticRows(region, stage, sector),
        source: 'venus-static-fallback',
        warning: 'Athena unreachable — using static Q1 2026 numbers.',
      },
      { headers: { 'cache-control': 'public, s-maxage=60' } }
    )
  }
}
