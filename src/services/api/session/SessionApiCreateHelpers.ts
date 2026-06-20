import type { CreateValuationSessionRequest } from '../../../types/api'
import type { CreateValuationSessionResponse } from '../../../types/api-responses'
import type { ValuationSession } from '../../../types/valuation'
import { stripReportBlobsFromSessionPatch } from '../../../utils/stripReportBlobsFromSessionPatch'
import {
  asSessionRecord,
  normalizeSessionView,
  type SessionRecord,
} from './SessionApiNormalization'

export type CreateValuationSessionInput = Partial<CreateValuationSessionRequest> &
  Omit<Partial<ValuationSession>, 'partialData' | 'sessionData'> & {
    current_step?: number
    partialData?: SessionRecord
    sessionData?: SessionRecord
    session_key?: string
  }

type CreateValuationSessionBackendPayload = {
  session_data: Record<string, unknown>
  view_type: 'simple' | 'advanced'
  current_step: number
  currentView: 'manual' | 'conversational'
  session_key?: string
}

export type CreateValuationSessionRequestModel = {
  currentView: 'manual' | 'conversational'
  sessionKey?: string
  payload: CreateValuationSessionBackendPayload
}

export function buildCreateValuationSessionRequest(
  session: CreateValuationSessionInput
): CreateValuationSessionRequestModel {
  const currentView = normalizeSessionView(session.currentView)
  const viewType = currentView === 'conversational' ? 'advanced' : 'simple'
  const sessionKeyCandidate = session.session_key || session.reportId
  const sessionKey = typeof sessionKeyCandidate === 'string' ? sessionKeyCandidate : undefined

  const sessionDataPayload = stripReportBlobsFromSessionPatch({
    ...(session.sessionData || {}),
    ...(session.partialData || {}),
    currentView,
    ...(session.dataSource && { dataSource: session.dataSource }),
    ...(typeof session.name === 'string' && { name: session.name }),
  }) as Record<string, unknown>

  return {
    currentView,
    sessionKey,
    payload: {
      session_data: sessionDataPayload,
      view_type: viewType,
      current_step: typeof session.current_step === 'number' ? session.current_step : 1,
      currentView,
      ...(sessionKey && { session_key: sessionKey }),
    },
  }
}

export function normalizeCreateValuationSessionResponse(
  rawSessionData: unknown,
  options: {
    currentView: 'manual' | 'conversational'
    fallbackName?: string
  }
): CreateValuationSessionResponse {
  const sessionData = asSessionRecord(rawSessionData)

  if (!sessionData) {
    throw new Error('Backend returned empty session data')
  }

  const reportIdCandidate = sessionData.session_key || sessionData.reportId
  const reportId = typeof reportIdCandidate === 'string' ? reportIdCandidate : undefined

  if (!reportId) {
    throw new Error('Backend returned incomplete session data: missing session_key')
  }

  const responseSessionData = asSessionRecord(sessionData.session_data) ?? {}
  const venusSession = {
    ...sessionData,
    reportId,
    currentView: options.currentView,
    sessionData: responseSessionData,
  } as unknown as ValuationSession

  if (typeof responseSessionData.name === 'string') {
    venusSession.name = responseSessionData.name
  } else if (typeof options.fallbackName === 'string') {
    venusSession.name = options.fallbackName
  }

  if (responseSessionData.currentView === 'ai-guided') {
    venusSession.currentView = 'conversational'
  }
  if (responseSessionData.dataSource === 'ai-guided') {
    responseSessionData.dataSource = 'conversational'
  }

  return {
    success: true,
    session: venusSession,
    reportId,
  }
}
