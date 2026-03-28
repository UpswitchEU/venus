/**
 * Compares forecast row snapshots to decide whether a row still matches the last
 * model-driven projection (so globals can safely re-apply) vs user overrides.
 */
export type DcfForecastModelSnapshot = {
  revenue: number
  ebitda: number
  capex: number
  depreciation: number
  nwc_change: number
}

const DEFAULT_TOL = 1

export function snapshotFromForecastRowLike(row: {
  revenue: number
  ebitda: number
  capex?: number
  depreciation?: number
  nwc_change?: number
}): DcfForecastModelSnapshot {
  return {
    revenue: row.revenue,
    ebitda: row.ebitda,
    capex: row.capex ?? 0,
    depreciation: row.depreciation ?? 0,
    nwc_change: row.nwc_change ?? 0,
  }
}

export function snapshotsClose(
  a: DcfForecastModelSnapshot,
  b: DcfForecastModelSnapshot,
  tol = DEFAULT_TOL
): boolean {
  return (
    Math.abs(a.revenue - b.revenue) <= tol &&
    Math.abs(a.ebitda - b.ebitda) <= tol &&
    Math.abs(a.capex - b.capex) <= tol &&
    Math.abs(a.depreciation - b.depreciation) <= tol &&
    Math.abs(a.nwc_change - b.nwc_change) <= tol
  )
}
