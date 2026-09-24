import { getCanonicalReportAlias } from '@/utils/reportIdentityPromotion'

/**
 * Reports for which a calculation completed AND its result was durably saved during this
 * visit (this page load). Leaving for Mercury only claims "valuation added" (`from=valuation`,
 * which Mercury celebrates) when the report being left is in here: Mercury's "Start valuation"
 * re-opens an existing report, so a result being present proves nothing about this visit.
 *
 * Kept in memory on purpose: a lost receipt (e.g. after a manual reload) only means a plain
 * return without confetti, while a persisted one could celebrate a later review-only visit.
 */
const savedThisVisit = new Set<string>()

function idsWithAliases(reportIds: readonly unknown[]): string[] {
  const ids: string[] = []
  for (const candidate of reportIds) {
    if (typeof candidate !== 'string') continue
    const id = candidate.trim()
    if (!id) continue
    ids.push(id)
    const alias = getCanonicalReportAlias(id)
    if (alias) ids.push(alias)
  }
  return ids
}

export function recordManualValuationSaved(reportIds: readonly unknown[]): void {
  for (const id of idsWithAliases(reportIds)) savedThisVisit.add(id)
}

export function wasManualValuationSavedThisVisit(reportIds: readonly unknown[]): boolean {
  const candidates = new Set(idsWithAliases(reportIds))
  if (candidates.size === 0) return false
  // A receipt recorded under the session key matches the saved UUID once its alias is known.
  return idsWithAliases([...savedThisVisit]).some((id) => candidates.has(id))
}

/** Test-only reset for the module-level receipt set. */
export function resetManualValuationSaveReceiptsForTests(): void {
  savedThisVisit.clear()
}
