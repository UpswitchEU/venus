import { tryRefetchAfterEnsureHtml } from '../../../services/session/SessionHtmlRecovery'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import {
  buildManualHtmlRecoverySession,
  extractRenderableHtmlFromSession,
  mergeRecoveredHtmlIntoResult,
  resultHasValuationRange,
  resultMissingRenderableHtml,
  sessionNeedsRenderableHtmlFromPayload,
} from './manualReportHtmlRecoveryCore'

export {
  buildManualHtmlRecoverySession,
  extractRenderableHtmlFromSession,
  mergeRecoveredHtmlIntoResult,
  resultHasValuationRange,
  resultMissingRenderableHtml,
} from './manualReportHtmlRecoveryCore'

export function needsManualReportHtmlRecovery(params: {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse | null | undefined
}): boolean {
  const { reportId, session, result } = params
  if (!reportId || reportId === 'new') return false

  const recoverySession = buildManualHtmlRecoverySession(reportId, session, result ?? null)
  const needsFromSession =
    session != null && sessionNeedsRenderableHtmlFromPayload(recoverySession)
  const needsFromResult =
    !!result && resultHasValuationRange(result) && resultMissingRenderableHtml(result)

  return needsFromSession || needsFromResult
}

export type RecoverManualReportHtmlStatus = 'not_needed' | 'recovered' | 'failed'

export interface RecoverManualReportHtmlResult {
  status: RecoverManualReportHtmlStatus
  html?: string
  result?: ValuationResponse
}

/**
 * Titan ensure-html + session refetch when calculate/bootstrap left only safety-net HTML.
 */
/**
 * After a successful calculate + save, attempt Titan ensure-html when only safety-net HTML exists.
 * Returns the result to keep in the results store (recovered or original).
 */
export async function applyPostCalculateHtmlRecovery(params: {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse
  setResult: (result: ValuationResponse | null) => void
}): Promise<ValuationResponse> {
  const recovery = await recoverManualReportHtmlIfNeeded({
    reportId: params.reportId,
    session: params.session,
    result: params.result,
  })
  if (recovery.status === 'recovered' && recovery.result) {
    params.setResult(recovery.result)
    return recovery.result
  }
  return params.result
}

export async function recoverManualReportHtmlIfNeeded(params: {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse | null | undefined
}): Promise<RecoverManualReportHtmlResult> {
  const { reportId, session, result } = params
  if (!needsManualReportHtmlRecovery({ reportId, session, result })) {
    return { status: 'not_needed' }
  }

  const recoverySession = buildManualHtmlRecoverySession(reportId, session, result ?? null)
  const refetched = await tryRefetchAfterEnsureHtml(reportId, recoverySession)
  if (!refetched?.session) {
    return { status: 'failed' }
  }

  const recoveredHtml = extractRenderableHtmlFromSession(refetched.session)
  if (!recoveredHtml) {
    return { status: 'failed' }
  }

  const base =
    result ?? (refetched.session.valuationResult as ValuationResponse | null | undefined)
  if (!base) {
    return { status: 'failed' }
  }

  const mergedResult = mergeRecoveredHtmlIntoResult(base, recoveredHtml)
  useSessionStore.getState().hydrateSession({
    valuationResult: mergedResult,
    htmlReport: recoveredHtml,
    reportId: refetched.session.reportId ?? reportId,
  })
  useSessionStore.getState().setRenderError(null)

  return {
    status: 'recovered',
    html: recoveredHtml,
    result: mergedResult,
  }
}
