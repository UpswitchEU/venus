import type { ValuationSessionResponse } from '../../types/api-responses'
import { createContextLogger } from '../../utils/logger'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { mergeSessionDataEnvelopesFromRoot } from '../../utils/sessionReportIdentity'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('SessionService')

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function htmlFromEnvelope(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function fetchValuationSessionWithCompletedReportRetry(
  reportId: string,
  attempt = 0
): Promise<ValuationSessionResponse | null> {
  const sessionResponse = await backendAPI.getValuationSession(reportId)
  if (!sessionResponse?.session) {
    return sessionResponse
  }

  const session = sessionResponse.session
  const sessionData = mergeSessionDataEnvelopesFromRoot(session)
  const sessionRecord = asRecord(session)
  const hasRenderableHtmlReport = !!getFirstRenderableReportHtml(
    htmlFromEnvelope(sessionData?._htmlReport),
    htmlFromEnvelope(sessionData?.html_report),
    session.htmlReport
  )
  const hasValuationResult = !!(
    session.valuationResult ||
    sessionData?.valuation_result ||
    sessionData?.valuationResult ||
    hasRenderableHtmlReport
  )
  const hasReportId = !!(sessionRecord?.report_id || session.reportId)
  const looksCompleted = hasReportId || session?.status === 'completed'

  if (looksCompleted && !hasValuationResult && attempt === 0) {
    logger.info('Completed report missing valuation result - retrying once', {
      reportId: reportId.substring(0, 30),
      hasReportId,
      status: session?.status,
    })
    await new Promise((resolve) => setTimeout(resolve, 300))
    return fetchValuationSessionWithCompletedReportRetry(reportId, 1)
  }

  return sessionResponse
}
