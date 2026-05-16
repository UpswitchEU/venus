/**
 * Book equity resolution for Belgian fiscal preview rows.
 *
 * Matches Titan `computeFiscalReferenceFields` / IQ `current_year_data` semantics:
 * - Prefer **non-zero** explicit `total_equity`.
 * - When equity is absent or explicitly **zero** (common placeholder before netting debt),
 *   derive from **`total_assets − total_debt`** first (Titan branch), then
 *   **`total_assets − total_liabilities`** (broader filings / Venus grid).
 */

export type YearRowForBookEquity = {
  total_equity?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  total_debt?: number | null
}

export function resolveBookEquityFromYearRow(
  row: YearRowForBookEquity | null | undefined
): number | null {
  if (!row) return null

  const eqNum =
    row.total_equity != null && Number.isFinite(Number(row.total_equity))
      ? Number(row.total_equity)
      : null

  const taNum =
    row.total_assets != null && Number.isFinite(Number(row.total_assets))
      ? Number(row.total_assets)
      : null
  const tlNum =
    row.total_liabilities != null && Number.isFinite(Number(row.total_liabilities))
      ? Number(row.total_liabilities)
      : null
  const tdNum =
    row.total_debt != null && Number.isFinite(Number(row.total_debt))
      ? Number(row.total_debt)
      : null

  if (eqNum != null && eqNum !== 0) return eqNum

  if (taNum != null && tdNum != null) {
    return taNum - tdNum
  }
  if (taNum != null && tlNum != null) {
    return taNum - tlNum
  }

  if (eqNum === 0) return 0

  return null
}
