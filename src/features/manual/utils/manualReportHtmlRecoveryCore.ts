import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import {
  buildRecoveryEligibilitySession,
  extractRenderableHtmlFromSessionPayload,
  mergeRecoveredHtmlIntoValuationSnapshot,
  sessionPayloadNeedsRenderableHtmlRecovery,
  valuationSnapshotHasRange,
} from '../../../utils/reportHtmlRecovery'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'

export { valuationSnapshotHasRange } from '../../../utils/reportHtmlRecovery'

export function extractRenderableHtmlFromSession(session: ValuationSession): string | undefined {
  return extractRenderableHtmlFromSessionPayload(session)
}

export function buildManualHtmlRecoverySession(
  reportId: string,
  session: ValuationSession | null | undefined,
  result: ValuationResponse | null | undefined
): ValuationSession {
  const base = {
    ...(session || {}),
    reportId: session?.reportId ?? reportId,
    sessionData: session?.sessionData ?? {},
    currentView: session?.currentView ?? 'manual',
    dataSource: session?.dataSource ?? 'manual',
  } as ValuationSession

  return buildRecoveryEligibilitySession(base, result ?? null)
}

export function resultHasValuationRange(result: ValuationResponse): boolean {
  return valuationSnapshotHasRange(result)
}

export function resultMissingRenderableHtml(
  result: ValuationResponse,
  standaloneHtmlReport?: string | null
): boolean {
  const r = result as unknown as Record<string, unknown>
  const details =
    typeof r.details === 'object' && r.details !== null
      ? (r.details as { html_report?: string })
      : undefined
  return !getFirstRenderableReportHtml(
    typeof r.html_report === 'string' ? r.html_report : undefined,
    typeof r.htmlReport === 'string' ? r.htmlReport : undefined,
    details?.html_report,
    standaloneHtmlReport
  )
}

export function mergeRecoveredHtmlIntoResult(
  base: ValuationResponse,
  html: string
): ValuationResponse {
  return mergeRecoveredHtmlIntoValuationSnapshot(base, html)
}

export function sessionNeedsRenderableHtmlFromPayload(session: ValuationSession): boolean {
  return sessionPayloadNeedsRenderableHtmlRecovery(session)
}

export function needsManualReportHtmlRecovery(params: {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse | null | undefined
  standaloneHtmlReport?: string | null
}): boolean {
  const { reportId, session, result, standaloneHtmlReport } = params
  if (!reportId || reportId === 'new') return false

  const recoverySession = buildManualHtmlRecoverySession(reportId, session, result ?? null)
  const needsFromSession =
    session != null && sessionNeedsRenderableHtmlFromPayload(recoverySession)
  const needsFromResult =
    !!result &&
    resultHasValuationRange(result) &&
    resultMissingRenderableHtml(result, standaloneHtmlReport)

  return needsFromSession || needsFromResult
}
