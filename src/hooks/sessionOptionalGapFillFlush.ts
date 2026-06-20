/**
 * Single coalesced application of {@link mergeOptionalSessionPrefillFields} per macrotask.
 * **Omni prefill contract:** every path that may load DCF / NAV / SaaS / multiples / SDE /
 * fiscal extras into `session.sessionData` should converge on this helper so we read a
 * consistent merged surface and coalesce patch application (avoids stomping `updateFormData`
 * races when bootstrap, SessionService, and Mercury prefill all hydrate in the same tick).
 */

import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useSessionStore } from '../store/useSessionStore'
import { buildOptionalSessionGapFillPatch } from '../utils/mergeOptionalSessionPrefillFields'

let flushToken = 0

export function queueOptionalGapFillFlush(): void {
  const next = ++flushToken
  queueMicrotask(() => {
    if (next !== flushToken) return
    if (!useSessionStore.getState().restorationComplete) return

    const reportId = useSessionStore.getState().session?.reportId
    if (!reportId || reportId === 'new') return

    const raw = useSessionStore.getState().session?.sessionData
    if (!raw || typeof raw !== 'object') return

    const patch = buildOptionalSessionGapFillPatch(raw, useManualFormStore.getState().formData)
    if (Object.keys(patch).length === 0) return

    useManualFormStore.getState().updateFormData(patch)
  })
}
