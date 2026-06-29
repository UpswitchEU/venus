import type { OfficialFinancialsPayload } from '../types/valuation'

/**
 * True when we have figures, filing year, or source links worth showing or sending downstream.
 * Error-only / empty trust stubs (legacy sessions) return false.
 */
export function hasUsableOfficialFinancialsContent(
  of: OfficialFinancialsPayload | null | undefined
): boolean {
  if (!of) return false
  const record = of as OfficialFinancialsPayload & Record<string, unknown>
  const hasFigures =
    (of.filingYear ?? record.filing_year) != null ||
    of.revenue != null ||
    of.ebitda != null ||
    (of.totalAssets ?? record.total_assets) != null ||
    of.equity != null
  const sourceLinks = of.sourceLinks ?? record.source_links
  const historicalYears = of.historicalYears ?? record.historical_years
  const excludedValuationYears = of.excludedValuationYears ?? record.excluded_valuation_years
  const hasLinks = Boolean(
    of.pdfUrl || record.pdf_url || (Array.isArray(sourceLinks) && sourceLinks.length > 0)
  )
  const hasHistoricalYears = Array.isArray(historicalYears) && historicalYears.length > 0
  const hasExcludedValuationYears =
    Array.isArray(excludedValuationYears) && excludedValuationYears.length > 0
  return hasFigures || hasLinks || hasHistoricalYears || hasExcludedValuationYears
}
