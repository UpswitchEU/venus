import type { SessionDataRecord } from '../services/session/SessionEngine'
import type { ValuationSession } from '../types/valuation'
import { preserveClientRecoveredHtmlWhenServerSessionStale } from '../utils/reportHtmlRecovery'
import { useManualResultsStore } from './manual/useManualResultsStore'

export function scheduleOptionalGapFillAfterHydrate(): void {
  queueMicrotask(() => {
    void import('../hooks/sessionOptionalGapFillFlush').then(({ queueOptionalGapFillFlush }) => {
      queueOptionalGapFillFlush()
    })
  })
}

const HYDRATE_SCALAR_KEYS: ReadonlySet<string> = new Set<string>([
  'reportId',
  'currentView',
  'dataSource',
  'createdAt',
  'updatedAt',
  'status',
  'reportReady',
  'name',
  'valuationResult',
  'htmlReport',
  'buyerReadiness',
])

export function isNonCriticalSaveFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  const isHardAuthFailure =
    normalized.includes('authentication required') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('invalid authentication token')

  if (isHardAuthFailure && !normalized.includes('temporarily unavailable')) {
    return false
  }

  const retryableStatusMatch =
    normalized.match(/\b(?:status(?:\s+code)?|http)\s*:?\s*(408|429|499|5\d{2})\b/) ||
    normalized.match(
      /\b(408|429|499|5\d{2})\s+(?:request timeout|too many requests|client closed request|service unavailable|server error|internal server error|bad gateway|gateway timeout)\b/
    )
  if (retryableStatusMatch?.[1]) return true

  return (
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('network') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('aborted') ||
    normalized.includes('canceled') ||
    normalized.includes('cancelled') ||
    normalized.includes('econnrefused') ||
    normalized.includes('econnreset') ||
    normalized.includes('etimedout') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('service unavailable') ||
    normalized.includes('did not respond in time') ||
    normalized.includes('upstream_timeout') ||
    normalized.includes('server error') ||
    normalized.includes('bad gateway') ||
    normalized.includes('gateway timeout')
  )
}

export function sessionHydrateUpdatesAreNoop(
  current: ValuationSession,
  updates: Partial<ValuationSession>
): boolean {
  const currentRecord = current as unknown as Record<string, unknown>
  const updatesRecord = updates as unknown as Record<string, unknown>
  for (const key of Object.keys(updatesRecord)) {
    if (key === 'sessionData' || key === 'partialData') continue
    if (HYDRATE_SCALAR_KEYS.has(key)) {
      if (!Object.is(currentRecord[key], updatesRecord[key])) {
        return false
      }
    } else {
      return false
    }
  }
  const incomingSessionData = updates.sessionData
  if (incomingSessionData && typeof incomingSessionData === 'object') {
    const currentSessionData = (current.sessionData ?? {}) as Record<string, unknown>
    const incoming = incomingSessionData as Record<string, unknown>
    for (const key of Object.keys(incoming)) {
      if (!Object.is(currentSessionData[key], incoming[key])) {
        return false
      }
    }
  }
  const incomingPartialData = updates.partialData
  if (incomingPartialData && typeof incomingPartialData === 'object') {
    const currentPartialData = (current.partialData ?? {}) as Record<string, unknown>
    const incoming = incomingPartialData as Record<string, unknown>
    for (const key of Object.keys(incoming)) {
      if (!Object.is(currentPartialData[key], incoming[key])) {
        return false
      }
    }
  }
  return true
}

function sessionDataHasBootstrapMarker(data: Record<string, unknown>): boolean {
  return '_bootstrapPrefill' in data || '_bootstrapCreated' in data
}

export function mergeSessionDataStrippingOptimisticShell(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined
): ValuationSession['sessionData'] {
  const merged = { ...(current || {}), ...(incoming || {}) } as Record<string, unknown>
  if (sessionDataHasBootstrapMarker(merged)) {
    delete merged._optimisticMercuryShell
  }
  return merged as ValuationSession['sessionData']
}

export function stripOptimisticShellFromSession(session: ValuationSession): ValuationSession {
  const sessionData = asSessionDataRecord(session.sessionData)
  if (!sessionDataHasBootstrapMarker(sessionData) || !('_optimisticMercuryShell' in sessionData)) {
    return session
  }
  const next = { ...sessionData }
  delete next._optimisticMercuryShell
  return { ...session, sessionData: next as ValuationSession['sessionData'] }
}

export function preserveRecoveredHtmlOnSessionCommit(
  incoming: ValuationSession,
  previous: ValuationSession | null | undefined
): ValuationSession {
  return preserveClientRecoveredHtmlWhenServerSessionStale(
    incoming,
    previous,
    previous
      ? {
          htmlReport: useManualResultsStore.getState().htmlReport,
          valuationResult: useManualResultsStore.getState().result,
        }
      : undefined
  )
}

export function normalizeHydrateUpdatesRemovingOptimisticShell(
  updates: Partial<ValuationSession>
): Partial<ValuationSession> {
  const sessionData = updates.sessionData
  if (!sessionData || typeof sessionData !== 'object') return updates
  const record = sessionData as Record<string, unknown>
  if (!('_optimisticMercuryShell' in record) || !sessionDataHasBootstrapMarker(record)) {
    return updates
  }
  const next = { ...record }
  delete next._optimisticMercuryShell
  return { ...updates, sessionData: next as ValuationSession['sessionData'] }
}

export function buildNoEngineHydratedSession(
  currentSession: ValuationSession | null | undefined,
  updates: Partial<ValuationSession>
): ValuationSession | null {
  const reportId = updates.reportId ?? currentSession?.reportId
  if (!reportId) return null

  return preserveRecoveredHtmlOnSessionCommit(
    currentSession
      ? {
          ...currentSession,
          ...updates,
          reportId: currentSession.reportId,
          sessionData: updates.sessionData
            ? mergeSessionDataStrippingOptimisticShell(
                asSessionDataRecord(currentSession.sessionData),
                asSessionDataRecord(updates.sessionData)
              )
            : currentSession.sessionData,
          partialData: updates.partialData
            ? {
                ...(currentSession.partialData || {}),
                ...updates.partialData,
              }
            : currentSession.partialData,
        }
      : ({
          reportId,
          currentView: updates.currentView || 'manual',
          dataSource: updates.dataSource || 'manual',
          createdAt: updates.createdAt || new Date(),
          updatedAt: updates.updatedAt || updates.createdAt || new Date(),
          sessionData: updates.sessionData || {},
          partialData: updates.partialData || {},
          ...(updates.status && { status: updates.status }),
          ...(updates.reportReady !== undefined && { reportReady: updates.reportReady }),
          ...(updates.name && { name: updates.name }),
          ...(updates.valuationResult && { valuationResult: updates.valuationResult }),
          ...(updates.htmlReport && { htmlReport: updates.htmlReport }),
          ...(updates.buyerReadiness && { buyerReadiness: updates.buyerReadiness }),
        } as ValuationSession),
    currentSession
  )
}

export function asSessionDataRecord(data: unknown): SessionDataRecord {
  return data && typeof data === 'object' ? (data as SessionDataRecord) : {}
}

export function readString(source: SessionDataRecord, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' ? value : null
}

export function hasNonEmptyString(source: SessionDataRecord, key: string): boolean {
  return (readString(source, key)?.trim().length ?? 0) > 0
}

export function readNumericLike(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const record = error as { response?: { status?: unknown }; status?: unknown }
  const nestedStatus = record.response?.status
  if (typeof nestedStatus === 'number') return nestedStatus
  return typeof record.status === 'number' ? record.status : null
}

export function createSessionNotFoundError(reportId: string): Error & {
  response: { status: number }
  status: number
  statusCode: number
} {
  return Object.assign(new Error(`Session not found: ${reportId}`), {
    response: { status: 404 },
    status: 404,
    statusCode: 404,
  })
}
