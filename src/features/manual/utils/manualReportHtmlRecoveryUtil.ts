import { tryRefetchAfterEnsureHtml } from '../../../services/session/SessionHtmlRecovery'
import { useManualResultsStore } from '../../../store/manual'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { applyRecoveredReportHtml } from '../../../utils/applyRecoveredReportHtml'
import { enrichRecoveryValuationSnapshot } from '../../../utils/reportHtmlRecovery'
import {
  buildManualHtmlRecoverySession,
  extractRenderableHtmlFromSession,
  needsManualReportHtmlRecovery,
  resultHasValuationRange,
  resultMissingRenderableHtml,
  sessionNeedsRenderableHtmlFromPayload,
} from './manualReportHtmlRecoveryCore'

export {
  buildManualHtmlRecoverySession,
  extractRenderableHtmlFromSession,
  needsManualReportHtmlRecovery,
  resultHasValuationRange,
  resultMissingRenderableHtml,
} from './manualReportHtmlRecoveryCore'

export type RecoverManualReportHtmlStatus = 'not_needed' | 'recovered' | 'failed'

export interface RecoverManualReportHtmlResult {
  status: RecoverManualReportHtmlStatus
  html?: string
  result?: ValuationResponse
}

function resolveStandaloneHtmlReport(explicit?: string | null): string | null | undefined {
  if (explicit !== undefined) return explicit
  return useManualResultsStore.getState().htmlReport
}

/**
 * Titan ensure-html + session refetch when calculate/bootstrap left only safety-net HTML.
 * After a successful calculate + save, attempt Titan ensure-html when only safety-net HTML exists.
 */
export async function applyPostCalculateHtmlRecovery(params: {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse
}): Promise<ValuationResponse> {
  const recovery = await recoverManualReportHtmlIfNeeded({
    reportId: params.reportId,
    session: params.session,
    result: params.result,
  })
  if (recovery.status === 'recovered' && recovery.result) {
    return recovery.result
  }
  return params.result
}

export async function recoverManualReportHtmlIfNeeded(params: {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse | null | undefined
  standaloneHtmlReport?: string | null
}): Promise<RecoverManualReportHtmlResult> {
  const { reportId, session, result } = params
  const standaloneHtmlReport = resolveStandaloneHtmlReport(params.standaloneHtmlReport)
  if (!needsManualReportHtmlRecovery({ reportId, session, result, standaloneHtmlReport })) {
    return { status: 'not_needed' }
  }

  const recoverySession = buildManualHtmlRecoverySession(reportId, session, result ?? null)
  const maxAttempts = 2
  const retryDelayMs = 1500

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }

    const refetched = await tryRefetchAfterEnsureHtml(reportId, recoverySession, {
      bypassCooldown: attempt > 0,
    })
    if (!refetched?.session) continue

    const recoveredHtml = extractRenderableHtmlFromSession(refetched.session)
    if (!recoveredHtml) continue

    const enrichedBase =
      result ??
      enrichRecoveryValuationSnapshot(recoverySession, null) ??
      (refetched.session.valuationResult as ValuationResponse | null | undefined)
    if (!enrichedBase) {
      return { status: 'failed' }
    }

    const mergedResult = applyRecoveredReportHtml({
      reportId,
      recoverySession,
      refetchedSession: refetched.session,
      baseResult: enrichedBase,
      recoveredHtml,
    })

    return {
      status: 'recovered',
      html: recoveredHtml,
      result: mergedResult,
    }
  }

  return { status: 'failed' }
}
