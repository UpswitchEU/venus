import { useCallback, useRef } from 'react'
import { useIsMountedRef, useLatestRef } from './useNavigationCancellation'

export interface ManualSubmitRunStaleContext {
  startLookupId: string | undefined
  currentLookupId: string | undefined
}

export interface ManualSubmitRun {
  id: number
  startLookupId: string | undefined
  isCurrent: () => boolean
  isStillTarget: () => boolean
  endLoading: () => void
  staleContext: () => ManualSubmitRunStaleContext
}

export interface UseManualSubmitRunGuardParams {
  lookupId: string | undefined
  endLoading: () => void
}

export interface CreateManualSubmitRunParams {
  id: number
  startLookupId: string | undefined
  getCurrentLookupId: () => string | undefined
  isMounted: () => boolean
  isLatestRun: (id: number) => boolean
  endLoading: () => void
}

export function createManualSubmitRun({
  id,
  startLookupId,
  getCurrentLookupId,
  isMounted,
  isLatestRun,
  endLoading,
}: CreateManualSubmitRunParams): ManualSubmitRun {
  const isCurrent = () => isMounted() && isLatestRun(id)
  const isStillTarget = () => isCurrent() && getCurrentLookupId() === startLookupId

  return {
    id,
    startLookupId,
    isCurrent,
    isStillTarget,
    endLoading: () => {
      if (isCurrent()) {
        endLoading()
      }
    },
    staleContext: () => ({
      startLookupId,
      currentLookupId: getCurrentLookupId(),
    }),
  }
}

/**
 * Creates submit-scoped guards for the long-running manual valuation POST.
 *
 * A calculation can outlive route changes. This hook centralizes the rules for
 * which post-await writes are still allowed to touch global valuation state.
 */
export function useManualSubmitRunGuard({
  lookupId,
  endLoading,
}: UseManualSubmitRunGuardParams): () => ManualSubmitRun {
  const mountedRef = useIsMountedRef()
  const lookupIdRef = useLatestRef(lookupId)
  const runIdRef = useRef(0)

  return useCallback(() => {
    const id = runIdRef.current + 1
    runIdRef.current = id
    const startLookupId = lookupIdRef.current

    return createManualSubmitRun({
      id,
      startLookupId,
      getCurrentLookupId: () => lookupIdRef.current,
      isMounted: () => mountedRef.current,
      isLatestRun: (runId) => runIdRef.current === runId,
      endLoading,
    })
  }, [endLoading, lookupIdRef, mountedRef])
}
