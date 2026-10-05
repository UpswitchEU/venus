import type { DelegatedMercuryHandoffSignals } from '../lib/mercury/sessionReadiness'
import {
  canRenderReportSession,
  hasAssetsInSession,
  shouldAllowOptimisticMercuryRender,
} from '../lib/mercury/sessionReadiness'
import type { ValuationSession } from '../types/valuation'
import { isSameReportIdentity } from '../utils/reportIdentityPromotion'

export type Stage = 'loading' | 'data-entry' | 'processing' | 'flow-selection' | 'error'

export function resolveValuationSessionStage({
  bootstrapError,
  bootstrapMode,
  delegatedHandoffSignals,
  isBootstrapping,
  isFromMercury,
  isInitializing,
  isLoading,
  reportId,
  requiresRenderableAssets,
  session,
  status,
  urlIndicatesExisting,
}: {
  bootstrapError: string | null | undefined
  bootstrapMode: 'new' | 'existing' | null | undefined
  delegatedHandoffSignals: DelegatedMercuryHandoffSignals
  isBootstrapping: boolean
  isFromMercury: boolean
  isInitializing: boolean
  isLoading: boolean
  reportId: string
  requiresRenderableAssets: boolean
  session: ValuationSession | null
  status: string
  urlIndicatesExisting: boolean
}): Stage {
  // A background refresh must never unmount a report that is already usable.
  if (isSameReportIdentity(session?.reportId, reportId) && hasAssetsInSession(session))
    return 'data-entry'

  // The load deadline is independent of bootstrap readiness. Waiting for
  // bootstrap to finish here can hide the timeout behind an endless skeleton.
  if (status === 'error') return 'error'

  if (
    !isLoading &&
    !isInitializing &&
    canRenderReportSession({
      session,
      reportId,
      requiresRenderableAssets,
    })
  ) {
    return 'data-entry'
  }

  if (
    shouldAllowOptimisticMercuryRender({
      isFromMercury,
      isBootstrapping,
      isLoading,
      bootstrapMode,
      urlIndicatesExisting,
      delegatedHandoffSignals,
    })
  ) {
    return 'data-entry'
  }

  if (
    bootstrapError &&
    !isBootstrapping &&
    (status === 'idle' || status === 'loading' || isInitializing)
  ) {
    return 'error'
  }

  if (isBootstrapping || isLoading || isInitializing || !session || session.reportId !== reportId) {
    return 'loading'
  }

  return 'data-entry'
}
