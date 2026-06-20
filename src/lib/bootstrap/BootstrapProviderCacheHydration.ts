import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { generalLogger } from '../../utils/logger'
import { setBootstrapState } from '../sessionInitialization'
import {
  clearScopedGlobalBootstrapResult,
  getScopedGlobalBootstrapReportId,
  getScopedGlobalBootstrapResult,
  rememberScopedGlobalBootstrapResult,
} from './BootstrapProviderCache'
import { bootstrapService } from './SessionBootstrapService'
import type { BootstrapContext as BootstrapContextShape, SessionBootstrapState } from './types'

interface BootstrapCacheCommitParams {
  activeContext: BootstrapContextShape
  bootstrapCompletedRef: MutableRefObject<boolean>
  bootstrapStartedRef: MutableRefObject<boolean>
  notifyComplete?: (state: SessionBootstrapState) => void
  rememberScopedResult?: boolean
  result: SessionBootstrapState
  setIsBootstrapping: Dispatch<SetStateAction<boolean>>
  setState: Dispatch<SetStateAction<SessionBootstrapState>>
}

export function resolveScopedBootstrapCacheResult(
  activeContext: BootstrapContextShape
): SessionBootstrapState | null {
  const cached =
    bootstrapService.getCachedResult(activeContext) || getScopedGlobalBootstrapResult(activeContext)
  if (cached) return cached

  generalLogger.debug('[BootstrapProvider] Ignoring stale module-level bootstrap cache', {
    requestedReportId: activeContext.reportId?.substring(0, 30),
    cachedReportId: getScopedGlobalBootstrapReportId()?.substring(0, 30),
  })
  clearScopedGlobalBootstrapResult()
  return null
}

export function commitBootstrapCacheResult({
  activeContext,
  bootstrapCompletedRef,
  bootstrapStartedRef,
  notifyComplete,
  rememberScopedResult = false,
  result,
  setIsBootstrapping,
  setState,
}: BootstrapCacheCommitParams): void {
  bootstrapStartedRef.current = true
  bootstrapCompletedRef.current = true
  if (rememberScopedResult) {
    rememberScopedGlobalBootstrapResult(activeContext, result)
  }
  setState(result)
  setIsBootstrapping(false)
  setBootstrapState(result)
  notifyComplete?.(result)
}
