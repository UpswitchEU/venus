import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'

export function extractRenderableHtmlFromSession(session: ValuationSession): string | undefined {
  const valuationResult = session.valuationResult as Record<string, unknown> | null | undefined
  const detailsHtml =
    typeof valuationResult?.details === 'object' && valuationResult.details !== null
      ? (valuationResult.details as { html_report?: string }).html_report
      : undefined

  return getFirstRenderableReportHtml(
    session.htmlReport,
    typeof valuationResult?.html_report === 'string' ? valuationResult.html_report : undefined,
    detailsHtml
  )
}

export function buildManualHtmlRecoverySession(
  reportId: string,
  session: ValuationSession | null | undefined,
  result: ValuationResponse | null | undefined
): ValuationSession {
  return {
    ...(session || {}),
    reportId: session?.reportId ?? reportId,
    valuationResult: result ?? session?.valuationResult,
    htmlReport: session?.htmlReport,
    sessionData: session?.sessionData ?? {},
    currentView: session?.currentView ?? 'manual',
    dataSource: session?.dataSource ?? 'manual',
  } as ValuationSession
}

export function resultHasValuationRange(result: ValuationResponse): boolean {
  const r = result as unknown as Record<string, unknown>
  return (
    r.equity_value_mid != null ||
    r.equity_value_low != null ||
    r.equity_value_high != null ||
    (typeof r.details === 'object' &&
      r.details !== null &&
      ((r.details as Record<string, unknown>).equity_value_mid != null ||
        (r.details as Record<string, unknown>).equity_value_low != null))
  )
}

export function resultMissingRenderableHtml(result: ValuationResponse): boolean {
  const r = result as unknown as Record<string, unknown>
  const details =
    typeof r.details === 'object' && r.details !== null
      ? (r.details as { html_report?: string })
      : undefined
  return !getFirstRenderableReportHtml(
    typeof r.html_report === 'string' ? r.html_report : undefined,
    details?.html_report
  )
}

export function mergeRecoveredHtmlIntoResult(
  base: ValuationResponse,
  html: string
): ValuationResponse {
  return { ...base, html_report: html }
}

export function valuationSnapshotHasRange(valuationResult: unknown): boolean {
  if (!valuationResult || typeof valuationResult !== 'object') return false
  const record = valuationResult as Record<string, unknown>
  return (
    record.equity_value_mid != null ||
    record.equity_value_low != null ||
    record.equity_value_high != null
  )
}

export function sessionNeedsRenderableHtmlFromPayload(session: ValuationSession): boolean {
  if (!session?.valuationResult) return false
  if (!valuationSnapshotHasRange(session.valuationResult)) return false
  return !extractRenderableHtmlFromSession(session)
}
