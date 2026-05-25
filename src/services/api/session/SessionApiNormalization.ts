import type { ValuationSession } from '../../../types/valuation'
import { apiLogger } from '../../../utils/logger'
import { applyStableReportIdFromSessionKeys } from '../../../utils/sessionReportIdentity'
import { normalizeSessionData } from '../../session/SessionNormalizer'

export type SessionRecord = Record<string, unknown>

type BackendSessionPayload = SessionRecord & {
  currentView?: unknown
  dataSource?: unknown
  htmlReport?: unknown
  name?: unknown
  partialData?: unknown
  reportReady?: unknown
  session_data?: unknown
  sessionData?: unknown
  status?: unknown
  view_type?: unknown
}

export function isSessionRecord(value: unknown): value is SessionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asSessionRecord(value: unknown): SessionRecord | null {
  return isSessionRecord(value) ? value : null
}

export function normalizeSessionView(value: unknown): 'manual' | 'conversational' {
  return value === 'ai-guided' || value === 'conversational' ? 'conversational' : 'manual'
}

function repairBackendSessionPayload(sessionData: unknown): BackendSessionPayload {
  const payload: BackendSessionPayload = { ...(asSessionRecord(sessionData) ?? {}) }

  applyStableReportIdFromSessionKeys(payload)

  if (payload.view_type === 'simple' && !payload.currentView) {
    payload.currentView = 'manual'
  } else if (payload.view_type === 'advanced' && !payload.currentView) {
    payload.currentView = 'conversational'
  }

  const backendSessionData = asSessionRecord(payload.session_data)
  if (backendSessionData) {
    payload.sessionData = payload.sessionData
      ? { ...backendSessionData, ...(asSessionRecord(payload.sessionData) ?? {}) }
      : backendSessionData
    payload.partialData = payload.partialData
      ? { ...backendSessionData, ...(asSessionRecord(payload.partialData) ?? {}) }
      : backendSessionData

    if (backendSessionData.currentView && !payload.currentView) {
      payload.currentView = backendSessionData.currentView
    }
    if (backendSessionData.dataSource && !payload.dataSource) {
      payload.dataSource = backendSessionData.dataSource
    }
  }

  const mergedSessionData = asSessionRecord(payload.sessionData)
  if (typeof payload.name !== 'string' && typeof mergedSessionData?.name === 'string') {
    payload.name = mergedSessionData.name
  }

  if ((payload.currentView as string) === 'ai-guided') {
    payload.currentView = 'conversational'
  }
  if (payload.dataSource === 'ai-guided') {
    payload.dataSource = 'conversational'
  }

  return payload
}

export function normalizeBackendSessionPayload(sessionData: unknown): ValuationSession {
  const payload = repairBackendSessionPayload(sessionData)
  const normalized = normalizeSessionData(payload)

  return {
    ...payload,
    status: payload.status ?? normalized.status,
    reportReady:
      typeof payload.reportReady === 'boolean' ? payload.reportReady : normalized.reportReady,
    valuationResult: normalized.valuationResult,
    htmlReport: normalized.htmlReport,
    _normalizedFormData: normalized.formData,
    _isNormalized: true,
  } as unknown as ValuationSession
}

export function parseGetSessionResponse(
  response: unknown,
  reportId: string
): { sessionData: SessionRecord; success: boolean } | null {
  const responseRecord = asSessionRecord(response)

  if (!responseRecord) {
    apiLogger.debug('Session not found - invalid response', { reportId })
    return null
  }

  const nestedData = asSessionRecord(responseRecord.data)
  if (nestedData && !('reportId' in responseRecord)) {
    return {
      sessionData: nestedData,
      success: typeof responseRecord.success === 'boolean' ? responseRecord.success : true,
    }
  }

  if ('reportId' in responseRecord || 'currentView' in responseRecord) {
    return {
      sessionData: responseRecord,
      success: typeof responseRecord.success === 'boolean' ? responseRecord.success : true,
    }
  }

  apiLogger.debug('Session not found - invalid response structure', {
    reportId,
    responseKeys: Object.keys(responseRecord),
  })
  return null
}
