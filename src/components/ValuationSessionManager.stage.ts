import type { DelegatedMercuryHandoffSignals } from '../lib/mercury/sessionReadiness'
import {
  canRenderReportSession,
  shouldAllowOptimisticMercuryRender,
} from '../lib/mercury/sessionReadiness'
import type { ValuationSession } from '../types/valuation'

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

  if (status === 'error' && !isBootstrapping) {
    return 'error'
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
