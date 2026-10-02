/**
 * Compares forecast row snapshots to decide whether a row still matches the last
 * model-driven projection (so globals can safely re-apply) vs user overrides.
 */
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'

export type DcfForecastModelSnapshot = {
  revenue: number | null
  ebitda: number | null
  capex: number | null
  depreciation: number | null
  nwc_change: number | null
}

const DEFAULT_TOL = 0

function observedValue(value: unknown): number | null {
  return parseFlexibleNumber(value) ?? null
}

export function snapshotFromForecastRowLike(row: {
  revenue: number | null
  ebitda: number | null
  capex?: number | null
  depreciation?: number | null
  nwc_change?: number | null
}): DcfForecastModelSnapshot {
  return {
    revenue: observedValue(row.revenue),
    ebitda: observedValue(row.ebitda),
    capex: observedValue(row.capex),
    depreciation: observedValue(row.depreciation),
    nwc_change: observedValue(row.nwc_change),
  }
}

export function snapshotsClose(
  a: DcfForecastModelSnapshot,
  b: DcfForecastModelSnapshot,
  tol = DEFAULT_TOL
): boolean {
  return (Object.keys(a) as Array<keyof DcfForecastModelSnapshot>).every((field) => {
    const left = a[field]
    const right = b[field]
    if (left == null || right == null) return left === right
    return Math.abs(left - right) <= tol
  })
}
