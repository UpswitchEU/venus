/**
 * Guards against report re-hydration while a delete is in flight.
 * Without this, useManualReportMethodHydration / restoration can repopulate
 * the right panel after optimistic clear (user must refresh to see empty state).
 */

const deletingReportIds = new Set<string>()

export function markReportsDeleting(ids: Array<string | null | undefined>): void {
  for (const id of ids) {
    const trimmed = id?.trim()
    if (trimmed) deletingReportIds.add(trimmed)
  }
}

export function clearReportsDeleting(): void {
  deletingReportIds.clear()
}

export function isReportDeleteInProgress(reportId?: string | null): boolean {
  if (deletingReportIds.size === 0) return false
  if (!reportId?.trim()) return true
  return deletingReportIds.has(reportId.trim())
}

export function isAnyReportDeleteInProgress(): boolean {
  return deletingReportIds.size > 0
}
