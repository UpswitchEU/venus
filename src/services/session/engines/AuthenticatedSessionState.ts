import type { ValuationSession } from '../../../types/valuation'

export function createAuthenticatedSessionFromUpdate(
  updates: Partial<ValuationSession>,
  updatedAt: Date
): ValuationSession | null {
  if (!updates.reportId) return null

  return {
    reportId: updates.reportId,
    currentView: updates.currentView || 'manual',
    dataSource: updates.dataSource || 'manual',
    createdAt: updates.createdAt || new Date(),
    updatedAt,
    sessionData: updates.sessionData || {},
    partialData: updates.partialData || {},
    ...(updates.status && { status: updates.status }),
    ...(updates.reportReady !== undefined && { reportReady: updates.reportReady }),
    ...(updates.name && { name: updates.name }),
    ...(updates.valuationResult && { valuationResult: updates.valuationResult }),
    ...(updates.htmlReport && { htmlReport: updates.htmlReport }),
  } as ValuationSession
}

export function mergeAuthenticatedSessionUpdate(
  currentSession: ValuationSession,
  updates: Partial<ValuationSession>,
  updatedAt: Date
): ValuationSession {
  const mergedSession = {
    ...currentSession,
    ...updates,
    updatedAt,
  }

  // Both envelopes are read by legacy consumers, and partialData wins when
  // building the save payload. Apply each explicit edit to both envelopes so
  // a copy hydrated from an earlier response cannot shadow the latest edit.
  // Explicit partialData keeps its existing precedence when both are supplied.
  if (updates.sessionData || updates.partialData) {
    const editedFields = { ...updates.sessionData, ...updates.partialData }
    mergedSession.sessionData = {
      ...(currentSession.sessionData || {}),
      ...editedFields,
    }
    mergedSession.partialData = {
      ...(currentSession.partialData || {}),
      ...editedFields,
    }
  }

  return mergedSession
}

export function normalizeAuthenticatedSessionReportId(
  session: ValuationSession,
  requestedReportId: string | null
): ValuationSession {
  if (!requestedReportId || session.reportId === requestedReportId) return session

  return { ...session, reportId: requestedReportId }
}
