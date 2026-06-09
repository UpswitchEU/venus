/**
 * usePdfStalenessLifecycle — owns the entire "is the PDF fresh enough to
 * download?" lifecycle. Before Phase 4c.2 Hook 3, this was 3 effects, 4 refs,
 * 4 useState slots, and 1 retry callback scattered across `ManualLayout.tsx`
 * (~250 lines) with `pdfWaitTimedOut` having **three** producers — the classic
 * "shared boolean from multiple sources" smell flagged in the Phase 4c.2 audit.
 *
 * Behaviour pinned (preserved from the inline implementation):
 *   1. `pdfStale` flips true when `report.reportUpdatedAt` is newer than
 *      `report.pdfGeneratedAt` (via `isPdfLikelyStaleVenus`).
 *   2. While stale, a sliding wait timeout (60s base, extended on transient
 *      5xx poll errors up to 180s) and a 2.5s poll interval against
 *      `/reports/{id}` run in parallel. Polling pauses while `usePdfGeneration`
 *      is actively generating so we do not hammer Titan alongside status polls.
 *   3. Poll success merges the fresh result + report and resets the
 *      session-404 streak. If the response still has no PDF — or the same
 *      stale `pdf_generated_at` as the prior poll — the "unchanged streak"
 *      counter increments; at 12 consecutive unchanged polls (~30s), the
 *      stalled banner appears even before the 60s timer.
 *   4. Poll 404 with a session-key reportId triggers exponential backoff
 *      (2.5s → 5s → 10s → ... → 60s) so a not-yet-linked session row does
 *      not hammer the backend.
 *   5. Client-side `usePdfGeneration` URL availability mirrors onto `report`
 *      so the staleness check clears as soon as a local render finishes.
 *   6. When async generation finishes, one immediate `getReport` syncs Titan's
 *      `pdf_generated_at` without waiting for the next 2.5s interval.
 *   7. Retry resets the unchanged streak + wait state, kicks `generatePdf()`,
 *      refetches the report, and merges. Still-stale refetch re-arms the wait
 *      timer; transient 5xx on retry extends the deadline without a toast.
 *      402 paywall → starter modal; other errors → toast.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import { hydrateClientValuationResultsMap } from '@/utils/extractValuationResultsMap'
import { isSessionKey } from '@/utils/identifiers'
import { generalLogger } from '@/utils/logger'
import { getRenderableReportHtmlFromCurrentOrFallback } from '@/utils/safetyNetReportHtml'
import {
  resolveSynthesisAwarePresentation,
  shouldAlignRecommendedAskingWithSynthesis,
} from '../components/manualReportPresentation'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'
import { isPdfTransientUpstreamStatus } from '@/utils/pdfTransientUpstream'
import { useIsMountedRef, useLatestRef } from './useNavigationCancellation'

const PDF_STALE_POLL_INTERVAL_MS = 2_500
const PDF_STALE_POLL_MAX_MS = 120_000
const PDF_STALE_WAIT_TIMEOUT_MS = 60_000
/** Extend the stall deadline when Titan is transiently unavailable (503 pooler blips). */
const PDF_STALE_WAIT_EXTENSION_MS = 20_000
const PDF_STALE_WAIT_MAX_MS = 180_000
/** 12 polls × 2.5s = 30s of unchanged pdf_generated_at before surfacing the stalled banner. */
const PDF_STALE_UNCHANGED_STREAK_THRESHOLD = 12
function isTransientPollError(err: unknown): boolean {
  return err instanceof APIError && isPdfTransientUpstreamStatus(err.statusCode)
}

/** Narrow signature for `t` from `useTranslations('toast')` (or equivalent). */
export type PdfLifecycleTranslator = (key: 'pdfExportFailed' | 'pdfExportFailedDesc') => string

/** Narrow signature for `backendAPI.getReport`. Accepted as a param for testability. */
export type GetReportFn = (
  reportId: string,
  opts?: { bySession404Attempts?: number }
) => Promise<ValuationResponse>

export interface UsePdfStalenessLifecycleParams {
  /** Current `report` state (the Clarity-shaped presentation row). */
  report: ValuationReportData | null | undefined
  /** `true` when `usePdfGeneration` reports a fresh local PDF. */
  isPdfReady: boolean
  /** `true` while async PDF generation / status polling is in flight. */
  isPdfGenerating: boolean
  /** Output of `usePdfGeneration` — only `.url` is consumed here. */
  pdfGenerationState: { url?: string | null }
  /** UUID resolved from the session — the poll target. `null` ⇒ no polling. */
  persistedReportLookupId: string | null
  /** Plan/firm gate for PDF actions; also gates the URL mirror. */
  canDownloadPdf: boolean
  /** `usePdfGeneration().generatePdf` — used by retry. Optional during paywall states. */
  generatePdf: (() => Promise<unknown>) | undefined
  /** Fetcher used by both the poll loop and retry. Pass `backendAPI.getReport`. */
  getReport: GetReportFn
  /** State setter for the canonical `result`. Poll-success merges flow through this. */
  setResult: (next: ValuationResponse) => void
  /** State setter for the panel's `report` slot. */
  setReport: (updater: (prev: ValuationReportData | null) => ValuationReportData | null) => void
  /** Opens the starter paywall on 402 retry errors. */
  openStarterPaywall: (reason: 'pdf_download') => void
  /** Toast triggered on non-paywall retry failure. */
  showRetryFailureToast: (title: string, options: { description: string }) => void
  /** Narrow translator for the two strings this hook surfaces. */
  translate: PdfLifecycleTranslator
}

export interface UsePdfStalenessLifecycleResult {
  /** Whether the displayed PDF is older than the latest report state. */
  pdfStale: boolean
  /**
   * True when the stalled banner should be shown — either the 60s wait timer
   * fired or the unchanged-poll streak hit 12.
   */
  pdfWaitTimedOut: boolean
  /** Consecutive non-404 poll errors. Surfaces a degraded-network hint at 2+. */
  pdfPollErrorCount: number
  /** Consecutive transient 5xx poll errors (503 pooler blips). Also surfaces degraded hint at 2+. */
  pdfPollTransientCount: number
  /** True while `retry` is in flight (button disabled, spinner shown). */
  isPdfRetrying: boolean
  /** Imperative retry handle — invoked from the stalled banner CTA. */
  retry: () => Promise<void>
}

function mergePolledResultWithExisting(
  fresh: ValuationResponse,
  latestExistingResult: ValuationResponse | null | undefined
): ValuationResponse {
  const nextValuationResults =
    hydrateClientValuationResultsMap(fresh) ??
    hydrateClientValuationResultsMap(latestExistingResult ?? null)
  return {
    ...(latestExistingResult || {}),
    ...fresh,
    html_report: getRenderableReportHtmlFromCurrentOrFallback(
      [fresh.html_report],
      [latestExistingResult?.html_report],
      {
        currentRenderFingerprint: fresh.render_fingerprint,
        fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
      }
    ),
    valuation_results: nextValuationResults ?? undefined,
    fiscal_4x_anchor: fresh.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
    multiple_adjustment_summary:
      fresh.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
  } as ValuationResponse
}

function reportPatchFromFreshResponse(
  fresh: ValuationResponse,
  canDownloadPdf: boolean
): Pick<
  ValuationReportData,
  | 'reportUpdatedAt'
  | 'pdfGeneratedAt'
  | 'pdfUrl'
  | 'renderFingerprint'
  | 'pdfRenderFingerprint'
  | 'pdfCoherent'
  | 'valuation'
  | 'valuationLow'
  | 'valuationHigh'
  | 'recommendedAskingPrice'
> {
  const storeSnap = useManualResultsStore.getState()
  const presentation = resolveSynthesisAwarePresentation(fresh, storeSnap.selectedMethod, {
    preSelectedMethods: storeSnap.preSelectedMethods,
    userWeights: storeSnap.userWeights,
  })

  return {
    reportUpdatedAt: fresh.updated_at ? new Date(String(fresh.updated_at)) : undefined,
    pdfGeneratedAt:
      fresh.pdf_generated_at != null && String(fresh.pdf_generated_at) !== ''
        ? new Date(String(fresh.pdf_generated_at))
        : null,
    pdfUrl: canDownloadPdf && typeof fresh.pdf_url === 'string' ? fresh.pdf_url : undefined,
    renderFingerprint:
      typeof fresh.render_fingerprint === 'string' ? fresh.render_fingerprint : null,
    pdfRenderFingerprint:
      typeof fresh.pdf_render_fingerprint === 'string' ? fresh.pdf_render_fingerprint : null,
    pdfCoherent: typeof fresh.pdf_coherent === 'boolean' ? fresh.pdf_coherent : null,
    valuation: presentation.valuation,
    valuationLow: presentation.valuationLow,
    valuationHigh: presentation.valuationHigh,
    ...(shouldAlignRecommendedAskingWithSynthesis(fresh, {
      preSelectedMethods: storeSnap.preSelectedMethods,
      userWeights: storeSnap.userWeights,
    })
      ? { recommendedAskingPrice: presentation.valuation }
      : {}),
  }
}

export function usePdfStalenessLifecycle(
  params: UsePdfStalenessLifecycleParams
): UsePdfStalenessLifecycleResult {
  const {
    report,
    isPdfReady,
    isPdfGenerating,
    pdfGenerationState,
    persistedReportLookupId,
    canDownloadPdf,
    generatePdf,
    getReport,
    setResult,
    setReport,
    openStarterPaywall,
    showRetryFailureToast,
    translate,
  } = params

  const [pdfWaitTimedOut, setPdfWaitTimedOut] = useState(false)
  const [isPdfRetrying, setIsPdfRetrying] = useState(false)
  const [pdfPollErrorCount, setPdfPollErrorCount] = useState(0)
  const [pdfPollTransientCount, setPdfPollTransientCount] = useState(0)

  /** Avoid overlapping getReport calls from the PDF-stale poll interval. */
  const pollInFlightRef = useRef(false)
  /** Back off polling while report row is not linked for val_* session keys (expected 404). */
  const bySessionBackoffUntilRef = useRef(0)
  const bySession404StreakRef = useRef(0)
  /**
   * Count of consecutive polls where Titan returned no PDF or the same stale
   * `pdf_generated_at` as the prior poll. At 12 (~30s) we surface the
   * stalled banner so the user can act and we stop hammering the backend.
   */
  const unchangedStreakRef = useRef(0)
  /** Last seen `pdf_generated_at` ms from a successful poll (stale-row dedup). */
  const lastPolledPdfGeneratedAtMsRef = useRef<number | null>(null)
  /** Sliding extension added to the base wait timeout after transient poll errors. */
  const waitExtensionMsRef = useRef(0)
  const waitTimerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Back off report polls while Titan returns transient 5xx (pooler / deploy blips). */
  const transientBackoffUntilRef = useRef(0)
  const transientErrorStreakRef = useRef(0)
  /**
   * Cancellation primitives — the retry handler captures these at start of
   * each async call and bails before writing to the global store if the
   * component has unmounted or `persistedReportLookupId` has changed
   * mid-flight. The poll effect uses an in-effect `cancelled` flag (see
   * below) since its cleanup runs on every dep change.
   */
  const isMountedRef = useIsMountedRef()
  const lookupIdRef = useLatestRef(persistedReportLookupId)
  const isPdfGeneratingRef = useRef(isPdfGenerating)
  isPdfGeneratingRef.current = isPdfGenerating

  const clearWaitTimer = useCallback(() => {
    if (waitTimerIdRef.current) {
      clearTimeout(waitTimerIdRef.current)
      waitTimerIdRef.current = null
    }
  }, [])

  const scheduleWaitTimeout = useCallback(() => {
    clearWaitTimer()
    const delayMs = Math.min(
      PDF_STALE_WAIT_MAX_MS,
      PDF_STALE_WAIT_TIMEOUT_MS + waitExtensionMsRef.current
    )
    waitTimerIdRef.current = setTimeout(() => {
      if (!isPdfGeneratingRef.current) setPdfWaitTimedOut(true)
    }, delayMs)
  }, [clearWaitTimer])

  const extendWaitTimeoutForTransientError = useCallback(() => {
    waitExtensionMsRef.current = Math.min(
      PDF_STALE_WAIT_MAX_MS - PDF_STALE_WAIT_TIMEOUT_MS,
      waitExtensionMsRef.current + PDF_STALE_WAIT_EXTENSION_MS
    )
    scheduleWaitTimeout()
  }, [scheduleWaitTimeout])

  const pdfStale = useMemo(() => {
    if (!report) return false
    const stale = isPdfLikelyStaleVenus(report)
    if (!stale) return false
    // Local PDF hook finished — trust the client render until Titan row catches up.
    if (isPdfReady && pdfGenerationState.url) return false
    if (isPdfReady && report.pdfGeneratedAt == null) return false
    return true
  }, [report, isPdfReady, pdfGenerationState.url])

  // ─── Effect A — mirror client-generated PDF URL into `report` ──────────
  useEffect(() => {
    if (!canDownloadPdf || !isPdfReady || !pdfGenerationState.url) return
    const url = pdfGenerationState.url
    setReport((prev) => {
      if (!prev) return prev
      const syncAt = prev.reportUpdatedAt ?? new Date()
      const pdfMs = prev.pdfGeneratedAt instanceof Date ? prev.pdfGeneratedAt.getTime() : null
      const syncMs = syncAt instanceof Date ? syncAt.getTime() : null
      if (
        prev.pdfUrl === url &&
        prev.pdfGeneratedAt != null &&
        pdfMs !== null &&
        syncMs !== null &&
        pdfMs === syncMs
      ) {
        return prev
      }
      return { ...prev, pdfUrl: url, pdfGeneratedAt: syncAt }
    })
  }, [canDownloadPdf, isPdfReady, pdfGenerationState.url, setReport])

  const applyPolledReport = useCallback(
    (fresh: ValuationResponse) => {
      const patch = reportPatchFromFreshResponse(fresh, canDownloadPdf)
      const latestExistingResult = useManualResultsStore.getState().result
      const mergedResult = mergePolledResultWithExisting(fresh, latestExistingResult)
      setResult(mergedResult)
      setReport((prev) => (prev ? { ...prev, ...patch } : prev))
      bySession404StreakRef.current = 0
      transientErrorStreakRef.current = 0
      transientBackoffUntilRef.current = 0
      setPdfPollErrorCount(0)
      setPdfPollTransientCount(0)

      const pdfIsFresh =
        patch.reportUpdatedAt != null &&
        !isPdfLikelyStaleVenus({
          reportUpdatedAt: patch.reportUpdatedAt,
          pdfGeneratedAt: patch.pdfGeneratedAt,
          pdfUrl: patch.pdfUrl,
          renderFingerprint: patch.renderFingerprint,
          pdfRenderFingerprint: patch.pdfRenderFingerprint,
          pdfCoherent: patch.pdfCoherent,
        })
      if (pdfIsFresh) {
        unchangedStreakRef.current = 0
        setPdfWaitTimedOut(false)
        clearWaitTimer()
        return
      }

      const pdfGenMs =
        patch.pdfGeneratedAt instanceof Date ? patch.pdfGeneratedAt.getTime() : null
      const stillNoPdf = pdfGenMs == null

      if (stillNoPdf) {
        lastPolledPdfGeneratedAtMsRef.current = null
        const streak = ++unchangedStreakRef.current
        if (streak >= PDF_STALE_UNCHANGED_STREAK_THRESHOLD && !isPdfGeneratingRef.current) {
          setPdfWaitTimedOut(true)
        }
        return
      }

      if (lastPolledPdfGeneratedAtMsRef.current === pdfGenMs) {
        const streak = ++unchangedStreakRef.current
        if (streak >= PDF_STALE_UNCHANGED_STREAK_THRESHOLD && !isPdfGeneratingRef.current) {
          setPdfWaitTimedOut(true)
        }
      } else {
        lastPolledPdfGeneratedAtMsRef.current = pdfGenMs
        unchangedStreakRef.current = 0
      }
    },
    [canDownloadPdf, setResult, setReport, clearWaitTimer]
  )

  const runStalePollOnce = useCallback(
    async (lookupId: string, isActive?: () => boolean): Promise<boolean> => {
      if (pollInFlightRef.current) return false
      if (isActive && !isActive()) return false
      if (isSessionKey(lookupId) && Date.now() < bySessionBackoffUntilRef.current) {
        return false
      }
      if (Date.now() < transientBackoffUntilRef.current) {
        return false
      }
      pollInFlightRef.current = true
      try {
        const fresh = await getReport(
          lookupId,
          isSessionKey(lookupId) ? { bySession404Attempts: 1 } : undefined
        )
        if (isActive && !isActive()) return false
        applyPolledReport(fresh)
        return true
      } catch (err) {
        if (isActive && !isActive()) return false
        const isSession404 = err instanceof APIError && err.statusCode === 404 && isSessionKey(lookupId)
        if (isSession404) {
          const streak = ++bySession404StreakRef.current
          const delayMs = Math.min(
            60_000,
            PDF_STALE_POLL_INTERVAL_MS * 2 ** Math.min(streak - 1, 5)
          )
          bySessionBackoffUntilRef.current = Date.now() + delayMs
          generalLogger.debug(
            '[usePdfStalenessLifecycle] PDF stale poll skipped backoff after by-session 404',
            {
              reportId: lookupId.substring(0, 40),
              streak,
              delayMs,
            }
          )
        } else if (isTransientPollError(err)) {
          const streak = ++transientErrorStreakRef.current
          const delayMs = Math.min(
            30_000,
            PDF_STALE_POLL_INTERVAL_MS * 2 ** Math.min(streak - 1, 4)
          )
          transientBackoffUntilRef.current = Date.now() + delayMs
          setPdfPollTransientCount((c) => c + 1)
          extendWaitTimeoutForTransientError()
          generalLogger.debug(
            '[usePdfStalenessLifecycle] PDF stale poll skipped backoff after transient error',
            {
              reportId: lookupId.substring(0, 40),
              statusCode: err instanceof APIError ? err.statusCode : undefined,
              streak,
              delayMs,
            }
          )
        } else {
          generalLogger.warn('[usePdfStalenessLifecycle] PDF stale poll getReport failed', {
            reportId: lookupId,
            error: err instanceof Error ? err.message : String(err),
          })
          setPdfPollErrorCount((c) => c + 1)
        }
        return false
      } finally {
        pollInFlightRef.current = false
      }
    },
    [applyPolledReport, extendWaitTimeoutForTransientError, getReport]
  )

  // ─── Defense — reset per-report poll backoff on lookup-id change ───────
  useEffect(() => {
    bySessionBackoffUntilRef.current = 0
    bySession404StreakRef.current = 0
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current = null
    waitExtensionMsRef.current = 0
    transientBackoffUntilRef.current = 0
    transientErrorStreakRef.current = 0
    pollInFlightRef.current = false
  }, [persistedReportLookupId])

  // ─── Effect E — wait timer + per-cycle reset ───────────────────────────
  useEffect(() => {
    if (!pdfStale || isPdfGenerating) {
      setPdfWaitTimedOut(false)
      clearWaitTimer()
      if (!pdfStale) {
        setPdfPollErrorCount(0)
        setPdfPollTransientCount(0)
        bySessionBackoffUntilRef.current = 0
        bySession404StreakRef.current = 0
        unchangedStreakRef.current = 0
        lastPolledPdfGeneratedAtMsRef.current = null
        waitExtensionMsRef.current = 0
        transientBackoffUntilRef.current = 0
        transientErrorStreakRef.current = 0
      }
      return
    }
    setPdfWaitTimedOut(false)
    // Reset the unchanged-response streak whenever a new stale cycle begins
    // (a fresh edit bumps `reportUpdatedAt`, this effect re-runs). Without
    // this reset, a streak that accumulated against a prior edit's failed
    // job would carry into the new cycle and prematurely surface "stalled".
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current =
      report?.pdfGeneratedAt instanceof Date ? report.pdfGeneratedAt.getTime() : null
    waitExtensionMsRef.current = 0
    transientBackoffUntilRef.current = 0
    transientErrorStreakRef.current = 0
    scheduleWaitTimeout()
    return () => clearWaitTimer()
  }, [pdfStale, isPdfGenerating, report?.pdfGeneratedAt, clearWaitTimer, scheduleWaitTimeout])

  // ─── Effect F — 2.5s poll interval while stale-not-yet-stalled ────────
  useEffect(() => {
    // Stop polling when the stalled banner is showing: either the 60s
    // setTimeout fired or the unchanged-response streak guard kicked in.
    // The user now sees the retry CTA — keeping the 2.5s interval running
    // just wastes their bandwidth and the backend's Prisma+Python budget.
    if (!pdfStale || !persistedReportLookupId || pdfWaitTimedOut || isPdfGenerating) return
    // `cancelled` flag handles the cross-report navigation race documented
    // in the Phase 4c.2 audit. When `persistedReportLookupId` changes mid-
    // flight, this effect's cleanup runs (sets `cancelled = true`), but any
    // in-flight `getReport` continues — its resolution would otherwise call
    // `setResult` against the GLOBAL `useManualResultsStore` and clobber the
    // new report's state. The cancelled check after the await bails before
    // any writes.
    let cancelled = false
    void runStalePollOnce(persistedReportLookupId, () => !cancelled)
    const id = setInterval(() => {
      if (cancelled) return
      void runStalePollOnce(persistedReportLookupId, () => !cancelled)
    }, PDF_STALE_POLL_INTERVAL_MS)
    const max = setTimeout(() => clearInterval(id), PDF_STALE_POLL_MAX_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      clearTimeout(max)
      pollInFlightRef.current = false
    }
  }, [
    pdfStale,
    persistedReportLookupId,
    pdfWaitTimedOut,
    isPdfGenerating,
    canDownloadPdf,
    getReport,
    setResult,
    setReport,
    runStalePollOnce,
  ])

  // ─── Effect G — sync Titan row immediately after generation finishes ───
  const wasPdfGeneratingRef = useRef(false)
  useEffect(() => {
    const wasGenerating = wasPdfGeneratingRef.current
    wasPdfGeneratingRef.current = isPdfGenerating
    if (!wasGenerating || isPdfGenerating) return
    if (!persistedReportLookupId) return
    // A background job may finish after the stalled banner latched — reopen the
    // wait window and sync Titan before the user has to click retry.
    setPdfWaitTimedOut(false)
    clearWaitTimer()
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current = null
    waitExtensionMsRef.current = 0
    transientBackoffUntilRef.current = 0
    transientErrorStreakRef.current = 0
    setPdfPollErrorCount(0)
    setPdfPollTransientCount(0)
    if (!pdfStale) return
    scheduleWaitTimeout()
    void runStalePollOnce(persistedReportLookupId, () => lookupIdRef.current === persistedReportLookupId)
  }, [
    isPdfGenerating,
    pdfStale,
    persistedReportLookupId,
    runStalePollOnce,
    lookupIdRef,
    clearWaitTimer,
    scheduleWaitTimeout,
  ])

  const retry = useCallback(async () => {
    if (!persistedReportLookupId) return
    if (!canDownloadPdf) {
      openStarterPaywall('pdf_download')
      return
    }
    // Capture the lookup id at start. If the user navigates to a different
    // report (or unmounts the component) before the awaits below resolve,
    // the post-await `isStillRelevant()` guards bail before any writes
    // reach the global `useManualResultsStore` / `setReport`.
    const startLookupId = persistedReportLookupId
    const isStillRelevant = () => isMountedRef.current && lookupIdRef.current === startLookupId

    setIsPdfRetrying(true)
    // Reset streak + wait state so the poll loop re-arms if the retry kicks
    // off a successful job. Without this reset, the user clicks retry, a
    // fresh PDF job runs, but Venus stays in the stalled state and never
    // polls for the new pdf_generated_at.
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current = null
    waitExtensionMsRef.current = 0
    transientBackoffUntilRef.current = 0
    transientErrorStreakRef.current = 0
    setPdfPollErrorCount(0)
    setPdfPollTransientCount(0)
    setPdfWaitTimedOut(false)
    clearWaitTimer()
    try {
      if (generatePdf) await generatePdf()
      if (!isStillRelevant()) return
      const fresh = await getReport(startLookupId)
      if (!isStillRelevant()) return
      applyPolledReport(fresh)
      const patch = reportPatchFromFreshResponse(fresh, canDownloadPdf)
      const pdfStillStaleAfterRetry =
        patch.reportUpdatedAt != null &&
        isPdfLikelyStaleVenus({
          reportUpdatedAt: patch.reportUpdatedAt,
          pdfGeneratedAt: patch.pdfGeneratedAt,
          pdfUrl: patch.pdfUrl,
          renderFingerprint: patch.renderFingerprint,
          pdfRenderFingerprint: patch.pdfRenderFingerprint,
          pdfCoherent: patch.pdfCoherent,
        })
      if (pdfStillStaleAfterRetry && !isPdfGeneratingRef.current) {
        scheduleWaitTimeout()
      }
    } catch (err) {
      if (!isStillRelevant()) return
      if (err instanceof APIError && err.statusCode === 402) {
        openStarterPaywall('pdf_download')
        return
      }
      if (isTransientPollError(err)) {
        extendWaitTimeoutForTransientError()
        if (!isPdfGeneratingRef.current) scheduleWaitTimeout()
        return
      }
      generalLogger.warn('[usePdfStalenessLifecycle] Retry stalled PDF failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      showRetryFailureToast(translate('pdfExportFailed'), {
        description: translate('pdfExportFailedDesc'),
      })
    } finally {
      if (isStillRelevant()) setIsPdfRetrying(false)
    }
  }, [
    generatePdf,
    getReport,
    persistedReportLookupId,
    setResult,
    setReport,
    canDownloadPdf,
    openStarterPaywall,
    showRetryFailureToast,
    translate,
    clearWaitTimer,
    applyPolledReport,
    scheduleWaitTimeout,
    extendWaitTimeoutForTransientError,
    isMountedRef,
    lookupIdRef,
  ])

  const effectivePdfWaitTimedOut = pdfWaitTimedOut && !isPdfGenerating

  return {
    pdfStale,
    pdfWaitTimedOut: effectivePdfWaitTimedOut,
    pdfPollErrorCount,
    pdfPollTransientCount,
    isPdfRetrying,
    retry,
  }
}
