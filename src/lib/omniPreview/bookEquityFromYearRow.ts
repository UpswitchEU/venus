/**
 * Mirrors ValuationIQ `omni_calc_coordinator._resolve_book_equity` using yearly row fields.
 */

export type YearRowForBookEquity = {
  total_equity?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  total_debt?: number | null
}

export function resolveBookEquityFromYearRow(row: YearRowForBookEquity | null | undefined): number | null {
  if (!row) return null
  const eq = row.total_equity
  if (eq != null && Number.isFinite(eq)) return eq

  const ta = row.total_assets
  const tl = row.total_liabilities
  if (ta != null && tl != null && Number.isFinite(ta) && Number.isFinite(tl)) {
    return ta - tl
  }

  const td = row.total_debt
  if (ta != null && td != null && Number.isFinite(ta) && Number.isFinite(td)) {
    return ta - td
  }

  return null
}
