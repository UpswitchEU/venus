'use client'

/**
 * Single subscription for post-restore prefill coordination: when `restorationComplete` is true
 * and the loaded session carries meaningful persisted valuation data, Mercury/session prefill must
 * not overwrite the form. {@link SessionRestorationService} calls `markMercurySessionPrefillSuppressed`
 * during restore; this hook is a safety net for any edge path where the flag was not set.
 *
 * @see useSessionDataPrefill
 * @see useFormSessionSync — form → session sync (restoration is session → form, handled elsewhere)
 */

import { useEffect } from 'react'
import { useSessionStore } from '../store/useSessionStore'
import { markMercurySessionPrefillSuppressed } from '../utils/prefillRestorationGate'
import { hasMeaningfulSessionData } from '../utils/sessionDataUtils'

export function usePrefillRestorationCoordinator(reportId: string | undefined): void {
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const session = useSessionStore((s) => s.session)

  useEffect(() => {
    if (!restorationComplete || !reportId || reportId === 'new') return
    if (!session || session.reportId !== reportId) return
    const sd = session.sessionData
    if (!hasMeaningfulSessionData(sd, session)) return
    markMercurySessionPrefillSuppressed(reportId)
  }, [restorationComplete, reportId, session])
}
