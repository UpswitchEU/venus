import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../types/valuation'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import {
  clearHtmlFromMissingRestorationAssets,
  mergeRecoveredHtmlIntoValuationSnapshot,
} from './reportHtmlRecovery'
import { globalSessionCache } from './sessionCacheManager'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function applyRecoveredReportHtml(params: {
  reportId: string
  recoverySession: ValuationSession
  refetchedSession: ValuationSession
  baseResult: ValuationResponse | Record<string, unknown>
  recoveredHtml: string
}): ValuationResponse {
  const { reportId, recoverySession, refetchedSession, baseResult, recoveredHtml } = params
  const canonicalReportId = refetchedSession.reportId ?? reportId
  const baseRecord = asRecord(baseResult) ?? {}
  const normalizedBase = {
    ...baseRecord,
    valuation_id:
      (typeof baseRecord.valuation_id === 'string' && baseRecord.valuation_id.trim()) ||
      (typeof baseRecord.id === 'string' && baseRecord.id.trim()) ||
      canonicalReportId,
  }

  const mergedResult = mergeRecoveredHtmlIntoValuationSnapshot(normalizedBase, recoveredHtml)
  const existingSession = useSessionStore.getState().session ?? recoverySession
  const patchedSessionData = clearHtmlFromMissingRestorationAssets({
    ...(asRecord(existingSession.sessionData) ?? {}),
    ...(asRecord(recoverySession.sessionData) ?? {}),
    ...(asRecord(refetchedSession.sessionData) ?? {}),
    _htmlReport: recoveredHtml,
    htmlReport: recoveredHtml,
    html_report: recoveredHtml,
  })
  const hydratedSession = {
    valuationResult: mergedResult,
    htmlReport: recoveredHtml,
    reportId: canonicalReportId,
    reportReady: true,
    sessionData: patchedSessionData,
  }

  useSessionStore.getState().hydrateSession(hydratedSession)
  useSessionStore.getState().setRenderError(null)

  const cachedSession = {
    ...existingSession,
    ...refetchedSession,
    ...hydratedSession,
  } as ValuationSession

  globalSessionCache.set(reportId, cachedSession)
  if (canonicalReportId !== reportId) {
    globalSessionCache.set(canonicalReportId, cachedSession)
  }

  const manualStore = useManualResultsStore.getState()
  manualStore.setResult(mergedResult)
  manualStore.setHtmlReport(recoveredHtml)

  SessionRestorationService.acknowledgeHtmlRecoveryComplete(canonicalReportId)
  if (canonicalReportId !== reportId) {
    SessionRestorationService.acknowledgeHtmlRecoveryComplete(reportId)
  }

  return mergedResult
}
