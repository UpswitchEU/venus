import { isReportDeleteInProgress } from '../utils/manualReportDeleteGuard'
import { hasManualRestorableReport } from '../utils/manualRestorableReport'

export function shouldRestoreExistingManualReport({
  isGenerating,
  report,
  reportId,
  resolvedReportId,
  session,
  sessionReportId,
}: {
  isGenerating: boolean
  report: unknown
  reportId?: string | null
  resolvedReportId?: string | null
  session: unknown
  sessionReportId?: string | null
}): boolean {
  return (
    !isReportDeleteInProgress(reportId) &&
    !isReportDeleteInProgress(resolvedReportId) &&
    !isReportDeleteInProgress(sessionReportId) &&
    !report &&
    !isGenerating &&
    !!session &&
    hasManualRestorableReport(session)
  )
}
