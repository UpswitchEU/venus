import type { OfficialFinancialsPayload } from '../types/valuation'

/**
 * True when we have figures, filing year, or source links worth showing or sending downstream.
 * Error-only / empty trust stubs (legacy sessions) return false.
 */
export function hasUsableOfficialFinancialsContent(
  of: OfficialFinancialsPayload | null | undefined
): boolean {
  if (!of) return false
  const hasFigures =
    of.filingYear != null ||
    of.revenue != null ||
    of.ebitda != null ||
    of.totalAssets != null ||
    of.equity != null
  const hasLinks = Boolean(of.pdfUrl || (of.sourceLinks && of.sourceLinks.length > 0))
  return hasFigures || hasLinks
}
