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
