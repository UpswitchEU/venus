import type { ValuationSession } from '../types/valuation'

type SessionLike = Pick<ValuationSession, 'reportId' | 'sessionData' | 'valuationResult' | 'htmlReport'> & {
  reportReady?: boolean
  status?: string
}

export function hasAssetsInSession(session: SessionLike | null | undefined): boolean {
  if (!session) return false

  const sd = (session.sessionData || {}) as Record<string, unknown>
  return !!(
    session.htmlReport?.trim() ||
    session.valuationResult ||
    sd._htmlReport ||
    sd.htmlReport ||
    sd.html_report ||
    sd.valuation_result ||
    sd.valuationResult
  )
}

export function shouldAllowOptimisticMercuryRender(params: {
  isFromMercury: boolean
  isBootstrapping: boolean
  isLoading: boolean
  bootstrapMode?: 'new' | 'existing' | null
}): boolean {
  return (
    params.isFromMercury &&
    params.isBootstrapping &&
    !params.isLoading &&
    params.bootstrapMode === 'new'
  )
}

export function canRenderReportSession(params: {
  session: SessionLike | null | undefined
  reportId: string
  requiresRenderableAssets: boolean
}): boolean {
  const { session, reportId, requiresRenderableAssets } = params
  if (!session || session.reportId !== reportId) return false
  if (!requiresRenderableAssets) return true
  if (session.reportReady === true) return true
  return hasAssetsInSession(session)
}
