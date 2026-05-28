import type { ValuationResponse } from '../../../types/valuation'
import { backendAPI } from '../../../services/backendApi'
import { useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { generalLogger } from '../../../utils/logger'
import { recoverManualReportHtmlIfNeeded } from './manualReportHtmlRecoveryUtil'

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const trimmed = id?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function valuationResultFromSession(
  session: { valuationResult?: unknown } | null | undefined
): ValuationResponse | null {
  const raw = session?.valuationResult
  if (!raw || typeof raw !== 'object') return null
  return raw as ValuationResponse
}

/**
 * After a failed delete of the active report, re-hydrate session + result so the
 * right panel shows the report again (no full page reload).
 */
export async function restoreManualWorkspaceAfterDeleteFailure(params: {
  lookupIds: Array<string | null | undefined>
}): Promise<boolean> {
  const lookupIds = uniqueIds(params.lookupIds)
  if (lookupIds.length === 0) return false

  let session = useSessionStore.getState().session
  const sessionStillUsable =
    session &&
    lookupIds.some(
      (id) =>
        id === session?.reportId?.trim() ||
        id === (session as { sessionKey?: string }).sessionKey?.trim()
    )

  if (!sessionStillUsable) {
    for (const id of lookupIds) {
      try {
        const response = await backendAPI.getValuationSession(id)
        if (!response?.session) continue
        useSessionStore.getState().hydrateSessionAndComplete(response.session)
        session = useSessionStore.getState().session
        break
      } catch (error) {
        generalLogger.warn('[ManualLayout] Failed to refetch session after delete failure', {
          lookupId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  if (!session) return false

  const reportId = session.reportId?.trim() ?? lookupIds[0]
  let result = valuationResultFromSession(session)
  if (!result) return false

  const recovery = await recoverManualReportHtmlIfNeeded({
    reportId,
    session,
    result,
  })
  if (recovery.status === 'recovered' && recovery.result) {
    result = recovery.result
  }

  useManualResultsStore.getState().setResult(result)

  generalLogger.info('[ManualLayout] Restored workspace after failed report delete', {
    reportId: reportId?.substring(0, 24),
  })
  return true
}
