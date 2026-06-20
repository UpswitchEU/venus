import type { IdentityState } from '../lib/bootstrap/types'
import type { DelegatedMercuryHandoffSignals } from '../lib/mercury/sessionReadiness'
import { isDelegatedMercuryAccountantHandoff } from '../lib/mercury/sessionReadiness'
import type { ValuationSession } from '../types/valuation'

export type OptimisticMercuryShellSeed = Partial<ValuationSession> & { reportId: string }

export type OptimisticMercuryShellRefusalReason = 'accountant_for_client' | 'delegated_handoff'

export function getOptimisticMercuryShellRefusalReason({
  delegatedHandoffSignals,
  identity,
}: {
  delegatedHandoffSignals?: DelegatedMercuryHandoffSignals
  identity: IdentityState
}): OptimisticMercuryShellRefusalReason | null {
  if (identity.type === 'accountant_for_client') {
    return 'accountant_for_client'
  }

  if (delegatedHandoffSignals && isDelegatedMercuryAccountantHandoff(delegatedHandoffSignals)) {
    return 'delegated_handoff'
  }

  return null
}

export function buildOptimisticMercuryShellSession(
  seedSession: OptimisticMercuryShellSeed
): ValuationSession {
  const now = seedSession.updatedAt || seedSession.createdAt || new Date()

  const builtSession: ValuationSession = {
    reportId: seedSession.reportId,
    currentView: seedSession.currentView || 'manual',
    dataSource: seedSession.dataSource || 'manual',
    createdAt: seedSession.createdAt || now,
    updatedAt: now,
    sessionData: seedSession.sessionData || {},
    partialData: seedSession.partialData || {},
    ...(seedSession.status && { status: seedSession.status }),
    ...(seedSession.reportReady !== undefined && { reportReady: seedSession.reportReady }),
    ...(seedSession.name && { name: seedSession.name }),
    ...(seedSession.valuationResult && { valuationResult: seedSession.valuationResult }),
    ...(seedSession.htmlReport && { htmlReport: seedSession.htmlReport }),
  }

  return builtSession
}
