/**
 * Resolves which user-entered revenue/EBITDA to compare against official NBB figures.
 *
 * When the official filing has a known `filingYear`, prefer the matching row in
 * `historical_years_data` or `current_year_data` so variance matches the same book year
 * as Staatsbladmonitor (not only the "latest complete" scalar from ManualLayout bridge).
 *
 * Otherwise falls back to the same precedence as `mapClarityFormToVenusStore`: store
 * `revenue`/`ebitda` (latest complete year) then `current_year_data`.
 */

import type { ValuationFormData } from '../types/valuation'

function normalizeCalendarYear(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 1800 && n <= 2200 ? Math.trunc(n) : null
}

export function resolveTrustComparisonUserFigures(
  fd: ValuationFormData,
  officialFilingYear?: number | string | null
): { revenue: number | undefined | null; ebitda: number | undefined | null } {
  const fy = normalizeCalendarYear(officialFilingYear)
  if (fy != null) {
    const hist = fd.historical_years_data
    if (Array.isArray(hist)) {
      const row = hist.find((r) => normalizeCalendarYear(r.year) === fy)
      if (row && (row.revenue != null || row.ebitda != null)) {
        return { revenue: row.revenue, ebitda: row.ebitda }
      }
    }
    const cyd = fd.current_year_data
    if (cyd && normalizeCalendarYear(cyd.year) === fy) {
      return { revenue: cyd.revenue, ebitda: cyd.ebitda }
    }
  }

  return {
    revenue: fd.revenue ?? fd.current_year_data?.revenue,
    ebitda: fd.ebitda ?? fd.current_year_data?.ebitda,
  }
}
