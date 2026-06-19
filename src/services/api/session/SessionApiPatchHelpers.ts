import type {
  SaveValuationResultResponse,
  UpdateValuationSessionResponse,
} from '../../../types/api-responses'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { isNetworkError } from '../../../utils/errors/errorGuards'
import {
  stripReportBlobsFromSessionPatch,
  stripReportBlobsFromValuationResult,
  stripReportsFromValuationSessionPatchUpdates,
} from '../../../utils/stripReportBlobsFromSessionPatch'
import { isTimeoutLikeError, toAxiosLikeError } from './SessionApiHttp'
import {
  asSessionRecord,
  normalizeBackendSessionPayload,
  type SessionRecord,
} from './SessionApiNormalization'

export function asRecord(value: unknown): SessionRecord | null {
  return asSessionRecord(value)
}

export function emptyOptimisticUpdate(): UpdateValuationSessionResponse {
  return {
    success: true,
    session: null as unknown as ValuationSession,
    updated: false,
  }
}

function isBackendSessionPayload(value: SessionRecord | null): value is SessionRecord {
  return !!(
    value &&
    ('id' in value ||
      'reportId' in value ||
      'session_key' in value ||
      'session_data' in value ||
      'sessionData' in value ||
      'view_type' in value)
  )
}

export function normalizeUpdateSessionResponse(response: unknown): UpdateValuationSessionResponse {
  const responseRecord = asRecord(response)
  const nestedData = asRecord(responseRecord?.data)
  const sessionPayload = isBackendSessionPayload(nestedData)
    ? nestedData
    : isBackendSessionPayload(responseRecord)
      ? responseRecord
      : null
  const sessionData = sessionPayload ? normalizeBackendSessionPayload(sessionPayload) : null

  return {
    success: typeof responseRecord?.success === 'boolean' ? responseRecord.success : true,
    session: sessionData as unknown as ValuationSession,
    updated: true,
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function transientSessionPatchMessage(error: unknown): string {
  const axiosError = toAxiosLikeError(error)
  const responseData = axiosError.response?.data
  const responseRecord = asRecord(responseData)
  return [
    axiosError.message,
    typeof responseData === 'string' ? responseData : undefined,
    typeof responseRecord?.message === 'string' ? responseRecord.message : undefined,
    typeof responseRecord?.error === 'string' ? responseRecord.error : undefined,
  ]
    .filter(Boolean)
    .join(' ')
}

export function isTransientSessionPatchError(error: unknown): boolean {
  const axiosError = toAxiosLikeError(error)
  const status = axiosError.response?.status
  if (status === 429 || status === 404) {
    return false
  }
  if (status === 503 || status === 504) {
    return false
  }
  if (status === 408 || status === 499 || status === 500 || status === 502) {
    return true
  }
  if (isNetworkError(error) || isTimeoutLikeError(error)) {
    return true
  }
  const message = transientSessionPatchMessage(error).toLowerCase()
  return (
    message.includes('premature close') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('connection terminated') ||
    message.includes('network error') ||
    message.includes('client closed request') ||
    message.includes('canceled') ||
    message.includes('cancelled') ||
    message.includes('aborted')
  )
}

export function mapTitanPatchAndStripReportBlobs(
  patch: Partial<ValuationSession> | undefined
): Record<string, unknown> {
  const p = patch as Record<string, unknown> | undefined
  if (!p) {
    return {}
  }

  const sessionData: Record<string, unknown> = {}
  const mergeIntoSessionData = (value: unknown): void => {
    const record = asRecord(value)
    if (record) {
      Object.assign(sessionData, record)
    }
  }

  mergeIntoSessionData(p.session_data)
  mergeIntoSessionData(p.sessionData)
  mergeIntoSessionData(p.partial_data)
  mergeIntoSessionData(p.partialData)

  const mappedCurrentView = p.currentView === 'conversational' ? 'ai-guided' : p.currentView
  const mappedDataSource = p.dataSource === 'conversational' ? 'ai-guided' : p.dataSource

  if (mappedCurrentView !== undefined) {
    sessionData.currentView = mappedCurrentView
  }
  if (mappedDataSource !== undefined) {
    sessionData.dataSource = mappedDataSource
  }
  if (typeof p.name === 'string') {
    sessionData.name = p.name
  }

  const knownTopLevelKeys = new Set([
    'buyerReadiness',
    'calculatedAt',
    'completedAt',
    'completeness',
    'createdAt',
    'current_step',
    'currentStep',
    'currentView',
    'dataSource',
    'guest_session_id',
    'htmlReport',
    'lastSyncedAt',
    'name',
    'partial_data',
    'partialData',
    'reportId',
    'reportReady',
    'session_data',
    'sessionData',
    'status',
    'updatedAt',
    'valuationResult',
    'view_type',
  ])

  for (const [key, value] of Object.entries(p)) {
    if (!knownTopLevelKeys.has(key)) {
      sessionData[key] = value
    }
  }

  const titanPatch: Record<string, unknown> = {}
  const strippedSessionData = stripReportBlobsFromSessionPatch(sessionData)
  if (
    strippedSessionData &&
    typeof strippedSessionData === 'object' &&
    !Array.isArray(strippedSessionData) &&
    Object.keys(strippedSessionData as Record<string, unknown>).length > 0
  ) {
    titanPatch.session_data = strippedSessionData
  }

  const rawViewType = p.view_type ?? mappedCurrentView
  if (rawViewType === 'simple' || rawViewType === 'advanced') {
    titanPatch.view_type = rawViewType
  } else if (rawViewType === 'manual') {
    titanPatch.view_type = 'simple'
  } else if (rawViewType === 'conversational' || rawViewType === 'ai-guided') {
    titanPatch.view_type = 'advanced'
  }

  const currentStep = p.current_step ?? p.currentStep
  if (typeof currentStep === 'number' && Number.isInteger(currentStep) && currentStep >= 1) {
    titanPatch.current_step = currentStep
  }

  if (p.status === 'active' || p.status === 'completed' || p.status === 'expired') {
    titanPatch.status = p.status
  }
  if (typeof p.guest_session_id === 'string') {
    titanPatch.guest_session_id = p.guest_session_id
  }

  return stripReportsFromValuationSessionPatchUpdates(titanPatch) as Record<string, unknown>
}

export function flattenStoreAndPatchIntoSessionDataForCreate(
  storeSessionData: Record<string, unknown> | undefined,
  patch: Partial<ValuationSession> | undefined
): Record<string, unknown> {
  const u = (patch || {}) as Record<string, unknown>
  const base: Record<string, unknown> = { ...(storeSessionData || {}) }
  const sd = u.sessionData
  const pd = u.partialData
  if (sd && typeof sd === 'object' && !Array.isArray(sd)) {
    Object.assign(base, sd as Record<string, unknown>)
  }
  if (pd && typeof pd === 'object' && !Array.isArray(pd)) {
    Object.assign(base, pd as Record<string, unknown>)
  }
  return stripReportBlobsFromSessionPatch(base) as Record<string, unknown>
}

export function stripValuationResultPayload(
  value: Partial<ValuationResponse> | SessionRecord | undefined
): Partial<ValuationResponse> | SessionRecord | undefined {
  return stripReportBlobsFromValuationResult(value) as
    | Partial<ValuationResponse>
    | SessionRecord
    | undefined
}

export function normalizeSaveValuationResultResponse(
  response: SaveValuationResultResponse | undefined
): SaveValuationResultResponse {
  if (!response) {
    return {
      success: true,
      message: 'Valuation result saved',
    }
  }

  return {
    ...response,
    session: response.session ? normalizeBackendSessionPayload(response.session) : response.session,
  }
}
