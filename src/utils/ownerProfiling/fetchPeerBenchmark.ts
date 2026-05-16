import { generalLogger } from '../logger'

/**
 * DATA-1 — fetch the anonymized owner-profile benchmark from Titan.
 *
 * Mirrors `submitAnonymizedBenchmarkContribution.ts`: same Titan base URL,
 * same fail-closed shape. Used by the Venus report-side peer panel
 * (`useOwnerProfileBenchmark` hook).
 *
 * Privacy contract: Titan returns `{ available: false }` when Delphi has
 * no benchmark for the cell (k-anon floor not crossed) or when Delphi is
 * unreachable. The hook treats both as "no panel" — the seller never
 * sees a "we don't have enough data" banner because that would leak
 * cohort size and undermine the privacy guarantee.
 */
export interface VenusOwnerProfileBenchmark {
  business_type_id: string
  country_code: string
  n: number
  tri: { p25: number; p50: number; p75: number }
  owner_dep: { p25: number; p50: number; p75: number }
  modal_risk_level: string | null
  most_recent_observation: string | null
  refreshed_at: string
}

interface FetchArgs {
  businessTypeId: string
  countryCode: string
  signal?: AbortSignal
}

function isUnavailableShape(value: unknown): value is { available: false } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { available?: unknown }).available === false
  )
}

function isAvailableShape(
  value: unknown
): value is { available: true; benchmark: VenusOwnerProfileBenchmark } {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  if (o.available !== true) return false
  const b = o.benchmark as Record<string, unknown> | null | undefined
  if (!b || typeof b !== 'object') return false
  const tri = b.tri as Record<string, unknown> | null | undefined
  const od = b.owner_dep as Record<string, unknown> | null | undefined
  return (
    typeof b.business_type_id === 'string' &&
    typeof b.country_code === 'string' &&
    typeof b.n === 'number' &&
    !!tri &&
    typeof tri.p25 === 'number' &&
    typeof tri.p50 === 'number' &&
    typeof tri.p75 === 'number' &&
    !!od &&
    typeof od.p25 === 'number' &&
    typeof od.p50 === 'number' &&
    typeof od.p75 === 'number' &&
    typeof b.refreshed_at === 'string'
  )
}

/**
 * Returns the benchmark cell or `null` when Delphi has no benchmark or
 * the request fails. Never throws — callers (the React panel) must
 * degrade silently on infra hiccups. Logs at info level so ops can
 * track the no-cell rate without page noise.
 */
export async function fetchOwnerProfilePeerBenchmark({
  businessTypeId,
  countryCode,
  signal,
}: FetchArgs): Promise<VenusOwnerProfileBenchmark | null> {
  const titanUrl = process.env.NEXT_PUBLIC_TITAN_API_URL || ''
  if (!titanUrl) return null
  if (!businessTypeId.trim()) return null
  const cc = countryCode.trim().toUpperCase()
  if (cc.length !== 2) return null

  const url = new URL(`${titanUrl}/api/v2/multiples/benchmarks/owner-profile`)
  url.searchParams.set('business_type_id', businessTypeId.trim())
  url.searchParams.set('country_code', cc)

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!res.ok) return null
    const raw: unknown = await res.json().catch(() => null)
    if (raw == null) return null
    if (isUnavailableShape(raw)) return null
    if (isAvailableShape(raw)) return raw.benchmark
    return null
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return null
    generalLogger.info('Owner profile peer benchmark fetch failed', {
      businessTypeId,
      countryCode: cc,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
