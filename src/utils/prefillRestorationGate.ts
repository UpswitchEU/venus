/**
 * Coordinates Mercury/session-driven prefill vs session restoration.
 * After authoritative restoration hydrates the form, broad prefill hooks must not overwrite.
 *
 * @see SessionRestorationService — calls mark when package or full restore completes
 * @see useSessionDataPrefill — skips when marked for current report
 * (Narrow gap-fill in `useSessionOptionalMethodPrefill` does not use this gate.)
 */

let mercurySessionPrefillSuppressedForReportId: string | null = null

/** Call when restoration has applied server/session form data for this report. */
export function markMercurySessionPrefillSuppressed(reportId: string): void {
  if (!reportId || reportId === 'new') return
  mercurySessionPrefillSuppressedForReportId = reportId
}

/** Testing / clearRestorationState: allow Mercury prefill again for this report. */
export function clearMercurySessionPrefillSuppression(reportId?: string): void {
  if (reportId == null) {
    mercurySessionPrefillSuppressedForReportId = null
    return
  }
  if (mercurySessionPrefillSuppressedForReportId === reportId) {
    mercurySessionPrefillSuppressedForReportId = null
  }
}

export function shouldSuppressMercurySessionPrefill(reportId: string | undefined): boolean {
  if (!reportId || reportId === 'new' || !mercurySessionPrefillSuppressedForReportId) return false
  return mercurySessionPrefillSuppressedForReportId === reportId
}
