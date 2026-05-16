/**
 * useRestorationGate — owns the 5-second restoration safety-timeout.
 *
 * The right panel shows a skeleton while `isRestoringExistingReport` is true
 * (session has prior data but `report` hasn't hydrated yet). Normally
 * `SessionRestorationService` flips `restorationComplete` to true and the
 * skeleton clears. As a defense-in-depth fallback, this hook also unblocks
 * the UI after 5 seconds — covering the rare case where the service never
 * emits the completion signal.
 *
 * The boolean returned (`effectiveIsRestoringExistingReport`) is the value
 * the panel actually renders against. Before Phase 4c.2 this was an inline
 * derivation of three flags scattered across `ManualLayout.tsx`; the hook
 * consolidates the 5s timer state + the AND-chain into one named seam.
 */

import { useEffect, useState } from 'react'
import { generalLogger } from '@/utils/logger'

const RESTORE_SAFETY_TIMEOUT_MS = 5_000

export interface UseRestorationGateParams {
  /**
   * `true` when the session carries prior valuation data but `report` is
   * still null (i.e. `SessionRestorationService` is mid-flight). The panel
   * derives this from `!report && !isGenerating && session-has-data`.
   */
  isRestoringExistingReport: boolean
  /**
   * `true` once `SessionRestorationService` has signalled completion via
   * `useSessionStore`. Acts as the primary "clear the skeleton" trigger;
   * the 5s timer is only a fallback.
   */
  restorationComplete: boolean
}

export interface UseRestorationGateResult {
  /**
   * `true` while the right panel should still show the restoration skeleton.
   * Becomes `false` when either the service signals completion OR the 5s
   * fallback timer fires.
   */
  effectiveIsRestoringExistingReport: boolean
  /**
   * `true` once the 5s fallback timer has fired in the current restoration
   * cycle. Exposed primarily for observability / tests; consumers should
   * read `effectiveIsRestoringExistingReport` instead.
   */
  restoreTimeoutFired: boolean
}

export function useRestorationGate(params: UseRestorationGateParams): UseRestorationGateResult {
  const { isRestoringExistingReport, restorationComplete } = params
  const [restoreTimeoutFired, setRestoreTimeoutFired] = useState(false)

  useEffect(() => {
    if (!isRestoringExistingReport) {
      setRestoreTimeoutFired(false)
      return
    }
    const id = setTimeout(() => {
      setRestoreTimeoutFired(true)
      generalLogger.warn(
        '[useRestorationGate] isRestoringExistingReport safety timeout fired - unblocking right panel'
      )
    }, RESTORE_SAFETY_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [isRestoringExistingReport])

  return {
    effectiveIsRestoringExistingReport:
      isRestoringExistingReport && !restorationComplete && !restoreTimeoutFired,
    restoreTimeoutFired,
  }
}
