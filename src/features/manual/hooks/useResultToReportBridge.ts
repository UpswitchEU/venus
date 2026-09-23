/**
 * useResultToReportBridge — the venus-API → Clarity-report bridge effect.
 *
 * Wraps the pure `mapValuationResultToReport` projection in a useEffect
 * that re-projects whenever `result` or a presentation input changes, plus
 * the side effects the original inline effect performed:
 *
 *   1. `usePreparerMultipleStore.syncFromValuationResult(result)` — pulls
 *      the preparer-multiple state out of the response so the override
 *      panel reflects the latest engine output (once per result object).
 *   2. `onComplete(result)` — fires the parent-callback (analytics, parent
 *      state machine, etc.).
 *   3. `setReport(mappedReport)` — drops the projected report into panel
 *      state for the right-rail render.
 *   Persistence status belongs to the session/save actions, never this projection.
 *   6. `setRightPanelView('preview')` — switches the right panel to the
 *      preview tab.
 *   7. On mobile + html present, `setShowFullscreenModal(true)`.
 *
 *   2, 6 and 7 announce a NEW result: they run once for the first result of a
 *   report and once per `resultAnnouncementSeq` bump (a calculation, a loaded
 *   or restored version). Everything else that replaces `result` — PDF and
 *   staleness polls, method hydration, HTML recovery, the save commit — only
 *   enriches the result on screen, and changes of the saved HTML, the blend,
 *   the selected method or the PDF flags only re-project it. Re-announcing on
 *   those pulled an advisor out of History back to Preview (and re-opened the
 *   mobile report) on every save commit and PDF start/finish.
 *   8. On `reportId + html + canDownloadPdf`, `generatePdf()` is fired
 *      in the background. **Note: also fires when the user has already
 *      generated a PDF manually this session — preserved verbatim per
 *      Phase 4c.2 product call.** 402 paywall errors are swallowed;
 *      other PDF-gen errors are logged but not surfaced (background gen).
 *      Exception: a run started by Mercury's one-shot intent (not by the
 *      advisor) never triggers a background PDF — the advisor has not
 *      reviewed the figures yet, and the PDF is regenerated on demand. The
 *      render fingerprint guard keeps poll merges from re-firing it.
 *
 * Errors thrown by the mapper are caught and logged with reportId +
 * valuationId context, then swallowed — the panel keeps rendering the
 * prior `report` state.
 */

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from 'react'
import type { RightPanelView, ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { usePreparerMultipleStore } from '@/store/manual/usePreparerMultipleStore'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import { generalLogger } from '@/utils/logger'
import { isSameReportIdentity } from '@/utils/reportIdentityPromotion'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'
import { isReportDeleteInProgress } from '../utils/manualReportDeleteGuard'
import {
  mapValuationResultToReport,
  type ReportTranslator,
} from '../utils/mapValuationResultToReport'
import { useLatestRef } from './useNavigationCancellation'

/** Who started the calculation that produced the latest `result`. */
export type ValuationRunTrigger = 'user' | 'intent'

/**
 * A run is intent-started exactly when Mercury's one-shot start intent is
 * driving it, which `handleStartProposal` marks by setting the start-proposal
 * version label around its submit. Every other path — the Calculate button,
 * retries, recalculate confirmations, agent-approved runs, the reconnect
 * resume — is the advisor acting, so it counts as `user`.
 */
export function resolveValuationRunTrigger(
  startProposalVersionLabel: string | null | undefined
): ValuationRunTrigger {
  return startProposalVersionLabel ? 'intent' : 'user'
}

export interface UseResultToReportBridgeParams {
  /** Latest API response. `null`/`undefined` ⇒ the effect no-ops. */
  result: ValuationResponse | null | undefined
  /**
   * Trigger of the run that produced `result`. `'intent'` (Mercury's one-shot
   * start) suppresses the background PDF; anything else preserves behaviour.
   */
  runTriggerRef?: MutableRefObject<ValuationRunTrigger | null>
  /** Session HTML fallback for self-heal before result.html_report catches up. */
  sessionHtmlReport?: string | null
  /** Results-store HTML fallback when not yet merged into result. */
  standaloneHtmlReport?: string | null
  /** Active selected method (passed through to the mapper). */
  selectedMethod: string
  /** Live Waarderingssynthese blend for report headline (optional). */
  clientBlendedValue?: number | null
  /** Route reportId (fallback id when result omits one). */
  reportId: string | undefined
  /** Plan/firm PDF gate. */
  canDownloadPdf: boolean
  /** Mobile breakpoint flag — gates the fullscreen-modal auto-open. */
  isMobile: boolean
  /** Narrowed `useTranslations('reportPanel')` consumer. */
  tReport: ReportTranslator
  /** Parent-callback fired after the bridge maps the result. */
  onComplete: (result: ValuationResponse) => void
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>
  setShowFullscreenModal: Dispatch<SetStateAction<boolean>>
  /** `usePdfGeneration().generatePdf` — fired in background on first map. */
  generatePdf: (() => Promise<unknown>) | undefined
  /** Skip duplicate POST /pdf while `usePdfGeneration` is already in flight. */
  isPdfGenerating?: boolean
}

function resultPdfTriggerFingerprint(result: ValuationResponse): string {
  const r = result as ValuationResponse & {
    render_fingerprint?: string | null
    updated_at?: string | null
    pdf_generated_at?: string | null
    pdf_url?: string | null
  }
  return [
    r.valuation_id ?? '',
    r.render_fingerprint ?? '',
    r.updated_at ?? '',
    r.pdf_generated_at ?? '',
    r.pdf_url ?? '',
  ].join('|')
}

export function useResultToReportBridge(params: UseResultToReportBridgeParams): void {
  const {
    result,
    sessionHtmlReport,
    standaloneHtmlReport,
    selectedMethod,
    clientBlendedValue,
    reportId,
    canDownloadPdf,
    isMobile,
    tReport,
    onComplete,
    setReport,
    setRightPanelView,
    setShowFullscreenModal,
    generatePdf,
    isPdfGenerating = false,
    runTriggerRef,
  } = params

  const generatePdfRef = useLatestRef(generatePdf)
  const isPdfGeneratingRef = useLatestRef(isPdfGenerating)
  const onCompleteRef = useLatestRef(onComplete)
  const setReportRef = useLatestRef(setReport)
  const setRightPanelViewRef = useLatestRef(setRightPanelView)
  const setShowFullscreenModalRef = useLatestRef(setShowFullscreenModal)
  const tReportRef = useLatestRef(tReport)
  const isPdfGenerationInFlight = isPdfGeneratingRef.current
  const lastPdfTriggerFingerprintRef = useRef<string | null>(null)
  const resultAnnouncementSeq = useManualResultsStore((state) => state.resultAnnouncementSeq)
  // Announcements made before this bridge mounted belong to an earlier workspace.
  const handledAnnouncementSeqRef = useRef(resultAnnouncementSeq)
  const reportKeyRef = useRef<string | null>(null)
  const announcedForReportRef = useRef(false)
  /** Result still on screen when the route switched reports; it is not the new report's. */
  const carriedOverResultRef = useRef<ValuationResponse | null>(null)
  const lastSeenResultRef = useRef<ValuationResponse | null>(null)
  const lastSyncedResultRef = useRef<ValuationResponse | null>(null)
  /** The mobile report opens once per announcement, as soon as it has HTML to show. */
  const mobileRevealPendingRef = useRef(false)

  useEffect(() => {
    void reportId
    lastPdfTriggerFingerprintRef.current = null
  }, [reportId])

  useEffect(() => {
    if (!result) {
      // Keep panel in sync when results store is cleared (delete, company change, list delete).
      setReportRef.current(null)
      announcedForReportRef.current = false
      carriedOverResultRef.current = null
      lastSeenResultRef.current = null
      lastSyncedResultRef.current = null
      mobileRevealPendingRef.current = false
      return
    }

    const resultReportId =
      (result as { valuation_id?: string; id?: string }).valuation_id ??
      (result as { valuation_id?: string; id?: string }).id ??
      reportId
    if (isReportDeleteInProgress(resultReportId) || isReportDeleteInProgress(reportId)) {
      return
    }

    // A route change from the session key to the saved report UUID is the same report.
    const reportKey = reportId ?? ''
    const previousReportKey = reportKeyRef.current
    if (
      previousReportKey !== null &&
      previousReportKey !== reportKey &&
      !isSameReportIdentity(previousReportKey, reportKey)
    ) {
      announcedForReportRef.current = false
      carriedOverResultRef.current = lastSeenResultRef.current
    }
    reportKeyRef.current = reportKey
    lastSeenResultRef.current = result
    const isFirstResultOfReport =
      !announcedForReportRef.current && result !== carriedOverResultRef.current
    const announce =
      isFirstResultOfReport || resultAnnouncementSeq !== handledAnnouncementSeqRef.current
    if (announce) {
      announcedForReportRef.current = true
      carriedOverResultRef.current = null
      handledAnnouncementSeqRef.current = resultAnnouncementSeq
      mobileRevealPendingRef.current = isMobile
    }

    try {
      // 1. Preparer-multiple store sync (once per result object).
      if (lastSyncedResultRef.current !== result) {
        lastSyncedResultRef.current = result
        usePreparerMultipleStore.getState().syncFromValuationResult(result)
      }
      // 2. Parent-callback.
      if (announce) onCompleteRef.current(result)

      // Build the report projection (pure).
      const mappedReport = mapValuationResultToReport({
        result,
        sessionHtmlReport,
        standaloneHtmlReport,
        selectedMethod,
        clientBlendedValue,
        reportId,
        canDownloadPdf,
        tReport: tReportRef.current,
      })

      // Projection does not claim that the current input state was saved.
      setReportRef.current(mappedReport)

      // 6. Show the new result in the preview tab.
      if (announce) setRightPanelViewRef.current('preview')

      // 7. Mobile fullscreen.
      if (mobileRevealPendingRef.current && isMobile && mappedReport.htmlReport) {
        mobileRevealPendingRef.current = false
        setShowFullscreenModalRef.current(true)
      }

      // 8. Background PDF generation — only when PDF is stale and fingerprint changed
      // (guards against poll merges re-firing POST /pdf).
      if (
        reportId &&
        mappedReport.htmlReport &&
        canDownloadPdf &&
        !isPdfGenerationInFlight &&
        runTriggerRef?.current !== 'intent' &&
        isPdfLikelyStaleVenus(mappedReport)
      ) {
        const pdfFingerprint = resultPdfTriggerFingerprint(result)
        if (lastPdfTriggerFingerprintRef.current !== pdfFingerprint) {
          lastPdfTriggerFingerprintRef.current = pdfFingerprint
          generatePdfRef.current?.().catch((err) => {
            if (err instanceof APIError && err.statusCode === 402) return
            generalLogger.warn('[useResultToReportBridge] Background PDF generation failed', {
              error: err instanceof Error ? err.message : String(err),
            })
          })
        }
      }
    } catch (error) {
      generalLogger.error(
        '[useResultToReportBridge] Failed to map result into report presentation',
        {
          reportId,
          valuationId:
            (result as { valuation_id?: string; id?: string })?.valuation_id ??
            (result as { valuation_id?: string; id?: string })?.id ??
            null,
          error: error instanceof Error ? error.message : String(error),
        }
      )
    }
  }, [
    result,
    resultAnnouncementSeq,
    sessionHtmlReport,
    standaloneHtmlReport,
    clientBlendedValue,
    reportId,
    generatePdfRef,
    isMobile,
    selectedMethod,
    canDownloadPdf,
    isPdfGenerationInFlight,
    runTriggerRef,
    onCompleteRef,
    setReportRef,
    setRightPanelViewRef,
    setShowFullscreenModalRef,
    tReportRef,
  ])
}
