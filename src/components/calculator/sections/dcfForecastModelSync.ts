/**
 * Compares forecast row snapshots to decide whether a row still matches the last
 * model-driven projection (so globals can safely re-apply) vs user overrides.
 */
import { availableFinancialNumber } from '@/utils/financialObservations'

export type DcfForecastModelSnapshot = {
  revenue: number | null
  ebitda: number | null
  capex: number | null
  depreciation: number | null
  nwc_change: number | null
}

const DEFAULT_TOL = 0
const SNAPSHOT_FIELDS = ['revenue', 'ebitda', 'capex', 'depreciation', 'nwc_change'] as const

export function snapshotFromForecastRowLike(row: {
  revenue?: number | null
  ebitda?: number | null
  capex?: number | null
  depreciation?: number | null
  nwc_change?: number | null
}): DcfForecastModelSnapshot {
  return {
    revenue: availableFinancialNumber(row, 'revenue') ?? null,
    ebitda: availableFinancialNumber(row, 'ebitda') ?? null,
    capex: availableFinancialNumber(row, 'capex') ?? null,
    depreciation: availableFinancialNumber(row, 'depreciation') ?? null,
    nwc_change: availableFinancialNumber(row, 'nwc_change') ?? null,
  }
}

export function snapshotsClose(
  a: DcfForecastModelSnapshot,
  b: DcfForecastModelSnapshot,
  tol = DEFAULT_TOL
): boolean {
  return SNAPSHOT_FIELDS.every((field) => {
    const left = a[field]
    const right = b[field]
    if (left == null || right == null) return left === right
    return Math.abs(left - right) <= tol
  })
}
