import { getFirstRenderableReportHtml } from '@/utils/safetyNetReportHtml'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Detects whether a hydrated manual session already carries enough report data
 * to keep the UI in restoration mode while the React report bridge catches up.
 */
export function hasManualRestorableReport(session: unknown): boolean {
  const sessionRecord = asRecord(session)
  if (!sessionRecord) return false

  const sessionDataRecord = asRecord(sessionRecord.sessionData)
  const hasRenderableHtml = !!getFirstRenderableReportHtml(
    readString(sessionRecord, 'htmlReport'),
    readString(sessionDataRecord, '_htmlReport'),
    readString(sessionDataRecord, 'htmlReport'),
    readString(sessionDataRecord, 'html_report'),
    readString(sessionRecord, '_htmlReport'),
    readString(sessionRecord, 'html_report')
  )

  return !!(
    sessionRecord.valuationResult ||
    sessionDataRecord?.valuationResult ||
    sessionDataRecord?.valuation_result ||
    sessionRecord.valuation_result ||
    hasRenderableHtml
  )
}
