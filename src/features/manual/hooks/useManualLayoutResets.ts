/**
 * useManualLayoutResets — single home for the panel-wide "reset this state when
 * identity changes" effects.
 *
 * Before Phase 4c.1, these 6 resets were scattered across `ManualValuationWorkspace.tsx`
 * over ~5,000 lines. A future engineer trying to answer "what gets reset when
 * the reportId changes?" had to grep for each `setX`/`refX.current = ...`
 * pattern. Consolidating them here gives the panel one named hook to call and
 * one named file to read.
 *
 * Each reset is still its own `useEffect` internally — they have distinct
 * triggers (report id, result content, route flag) and keeping them separate
 * preserves React's dep-array semantics. The win is organisational, not
 * effect-count: 6 inline effects in the panel become 1 hook call.
 */

import { type MutableRefObject, useEffect } from 'react'
import type { ValuationResponse } from '@/types/valuation'
import { buildQualityWarningResetKey } from '@/utils/qualityWarningResetKey'

export interface ManualLayoutResetRefs {
  /** Latest "fresh result" signature for quality-warning ack invalidation. */
  lastQualityWarningResetKeyRef: MutableRefObject<string | null>
  /** Run-key of the most recent "synthesis blend skipped" toast (dedup). */
  lastSynthesisBlendSkippedRunKeyRef: MutableRefObject<string | null>
  /** Last-submitted financial snapshot used to detect form edits since calc. */
  lastSubmittedFinancialSnapshotRef: MutableRefObject<unknown>
}

export interface UseManualLayoutResetsParams {
  /** The route's reportId (may be 'new' or a session key). */
  reportId: string | undefined
  /** Latest ValuationResponse — drives the content-keyed quality-ack reset. */
  result: ValuationResponse | null | undefined
  /** True iff the current effective method routes through the startup panel. */
  isStartupAssistantRoute: boolean
  /** React state setters for the slices reset by identity change. */
  setIsDirty: (value: boolean) => void
  setAcknowledgedStartupIssues: (value: Set<string>) => void
  setAcknowledgedQualityWarnings: (value: Set<string>) => void
  /** Refs the hook clears on identity change. Forwarded by the panel. */
  refs: ManualLayoutResetRefs
}

export function useManualLayoutResets(params: UseManualLayoutResetsParams): void {
  const {
    reportId,
    result,
    isStartupAssistantRoute,
    setIsDirty,
    setAcknowledgedStartupIssues,
    setAcknowledgedQualityWarnings,
    refs,
  } = params

  // Note: PDF-stale poll trackers (`pdfStaleBySessionBackoffUntilRef`,
  // `pdfStaleBySession404StreakRef`) are now owned by
  // `usePdfStalenessLifecycle`, which resets them on its own
  // `persistedReportLookupId` boundary.

  // Effect 1384: quality-warning + synthesis-blend-skipped dedup trackers reset
  // when the route reportId changes (entering a different valuation).
  useEffect(() => {
    void reportId
    refs.lastQualityWarningResetKeyRef.current = null
    refs.lastSynthesisBlendSkippedRunKeyRef.current = null
  }, [reportId, refs.lastQualityWarningResetKeyRef, refs.lastSynthesisBlendSkippedRunKeyRef])

  // Effect 1389: acknowledged startup issues set reset on reportId change.
  useEffect(() => {
    void reportId
    setAcknowledgedStartupIssues(new Set())
  }, [reportId, setAcknowledgedStartupIssues])

  // Effect 1980: form-dirty flag + last-submitted financial snapshot reset on
  // reportId change so a fresh valuation does not inherit prior edit-detection
  // state.
  useEffect(() => {
    void reportId
    refs.lastSubmittedFinancialSnapshotRef.current = null
    setIsDirty(false)
  }, [reportId, refs.lastSubmittedFinancialSnapshotRef, setIsDirty])

  // Effect 2827: when a materially new result arrives, clear stale ack entries
  // so the user is re-prompted for warnings that the new run actually emits.
  // Content-keyed (NOT identity-keyed) — uses `buildQualityWarningResetKey` to
  // detect a "new" result independent of object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!result) return
    const resetKey = buildQualityWarningResetKey(result)
    if (resetKey !== refs.lastQualityWarningResetKeyRef.current) {
      setAcknowledgedQualityWarnings(new Set())
      refs.lastQualityWarningResetKeyRef.current = resetKey
    }
  }, [result, refs.lastQualityWarningResetKeyRef, setAcknowledgedQualityWarnings])

  // Effect 5860: acknowledged startup issues set cleared when the user leaves
  // the startup route (the issue surface is venture-path-specific).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isStartupAssistantRoute) return
    setAcknowledgedStartupIssues(new Set())
  }, [isStartupAssistantRoute, setAcknowledgedStartupIssues])
}
