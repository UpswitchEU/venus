import type { ValuationSession } from '../types/valuation'
import { getFirstRenderableReportHtml } from '../utils/safetyNetReportHtml'

type SessionLike = {
  reportId: ValuationSession['reportId']
  sessionData?: ValuationSession['sessionData'] | Record<string, unknown> | null
  valuationResult?: ValuationSession['valuationResult']
  htmlReport?: ValuationSession['htmlReport'] | null
  reportReady?: boolean
  status?: string
}

export function hasAssetsInSession(session: SessionLike | null | undefined): boolean {
  if (!session) return false

  const sd = (session.sessionData || {}) as Record<string, unknown>
  const htmlReport = getFirstRenderableReportHtml(
    session.htmlReport,
    typeof sd._htmlReport === 'string' ? sd._htmlReport : null,
    typeof sd.htmlReport === 'string' ? sd.htmlReport : null,
    typeof sd.html_report === 'string' ? sd.html_report : null
  )
  return !!(htmlReport || session.valuationResult || sd.valuation_result || sd.valuationResult)
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

export function shouldSeedOptimisticMercuryShell(params: {
  isFromMercury: boolean
  isBootstrapping: boolean
  reportId: string | null | undefined
  urlIndicatesExisting: boolean
  currentSessionReportId?: string | null
  status: string
  seededReportId?: string | null
}): boolean {
  if (!params.isFromMercury || !params.isBootstrapping) return false
  if (!params.reportId || params.reportId === 'new') return false
  if (!params.urlIndicatesExisting) return false
  if (params.currentSessionReportId === params.reportId) return false
  if (params.seededReportId === params.reportId) return false

  // `loaded` covers SPA handoffs where the previous report is still in the
  // store. Mercury should still get the fast shell for the new report.
  return params.status === 'idle' || params.status === 'loaded'
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
