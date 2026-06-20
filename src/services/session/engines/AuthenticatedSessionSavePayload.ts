import type { ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { preserveClientRecoveredHtmlWhenServerSessionStale } from '../../../utils/reportHtmlRecovery'

/**
 * Backend-computed fields that must NOT round-trip through autosave PATCHes.
 *
 * The session blob the engine holds in memory mirrors what Titan returns,
 * including heavy server-rendered artifacts. Sending them back in every PATCH
 * causes multi-MB autosaves and can clobber fresher backend-calculated data.
 */
const BACKEND_COMPUTED_SESSION_KEYS = new Set<string>([
  'valuation_result',
  'valuationResult',
  '_valuationResult',
  'html_report',
  'htmlReport',
  '_htmlReport',
  'pdf_html_report',
  'pdfHtmlReport',
  '_pdfHtmlReport',
  'pdfHtml',
  'reportHtml',
  'report_context',
])

export function stripBackendComputedFields(payload: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {}
  let removedCount = 0
  let removedBytes = 0
  for (const [key, value] of Object.entries(payload)) {
    if (BACKEND_COMPUTED_SESSION_KEYS.has(key)) {
      removedCount += 1
      try {
        removedBytes += JSON.stringify(value)?.length ?? 0
      } catch {
        /* unstringifiable - skip the byte count, keep the strip */
      }
      continue
    }
    stripped[key] = value
  }
  if (removedCount > 0) {
    generalLogger.debug(
      '[AuthenticatedSessionEngine] Stripped backend-computed keys from autosave',
      {
        removedCount,
        approxBytesRemoved: removedBytes,
      }
    )
  }
  return stripped
}

function normalizeForAutosaveFingerprint(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForAutosaveFingerprint(item))
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const normalized: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const child = record[key]
      if (child !== undefined) {
        normalized[key] = normalizeForAutosaveFingerprint(child)
      }
    }
    return normalized
  }
  return value
}

export function autosavePayloadFingerprint(payload: Record<string, unknown>): string {
  return JSON.stringify(normalizeForAutosaveFingerprint(payload))
}

export function buildAuthenticatedSessionSavePayload(
  currentSession: ValuationSession
): Record<string, unknown> {
  const mergedPayload = {
    ...(currentSession.sessionData || {}),
    ...(currentSession.partialData || {}),
  }

  return {
    ...stripBackendComputedFields(mergedPayload),
    currentView: currentSession.currentView,
    ...(currentSession.name !== undefined && { name: currentSession.name }),
  }
}

export function mergeQueuedLocalSession(
  serverSession: ValuationSession,
  localSession: ValuationSession
): ValuationSession {
  const merged: ValuationSession = {
    ...serverSession,
    ...localSession,
    status: serverSession.status ?? localSession.status,
    reportReady:
      localSession.reportReady === true
        ? true
        : (serverSession.reportReady ?? localSession.reportReady),
    sessionData: {
      ...(serverSession.sessionData || {}),
      ...(localSession.sessionData || {}),
    },
    partialData: {
      ...(serverSession.partialData || {}),
      ...(localSession.partialData || {}),
    },
  }

  return preserveClientRecoveredHtmlWhenServerSessionStale(merged, localSession)
}
