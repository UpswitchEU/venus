/**
 * useResultToReportBridge — the venus-API → Clarity-report bridge effect.
 *
 * Wraps the pure `mapValuationResultToReport` projection in a useEffect
 * that fires every time `result` changes, plus the seven side effects the
 * original inline effect performed:
 *
 *   1. `usePreparerMultipleStore.syncFromValuationResult(result)` — pulls
 *      the preparer-multiple state out of the response so the override
 *      panel reflects the latest engine output.
 *   2. `onComplete(result)` — fires the parent-callback (analytics, parent
 *      state machine, etc.).
 *   3. `setReport(mappedReport)` — drops the projected report into panel
 *      state for the right-rail render.
 *   4. `setDraftStatus('saved')` — marks the draft as persisted when not
 *      mid-save (`draftStatus !== 'saving'`). Durable save hooks own status
 *      during PUT /result.
 *   5. `setLastSaved(new Date())` — stamps the last-saved indicator (same guard).
 *   6. `setRightPanelView('preview')` — switches the right panel to the
 *      preview tab. **Note: this overrides prior user navigation on every
 *      result-arrival — preserved verbatim per Phase 4c.2 product call.**
 *   7. On mobile + html present, `setShowFullscreenModal(true)`.
 *   8. On `reportId + html + canDownloadPdf`, `generatePdf()` is fired
 *      in the background. **Note: also fires when the user has already
 *      generated a PDF manually this session — preserved verbatim per
 *      Phase 4c.2 product call.** 402 paywall errors are swallowed;
 *      other PDF-gen errors are logged but not surfaced (background gen).
 *
 * Errors thrown by the mapper are caught and logged with reportId +
 * valuationId context, then swallowed — the panel keeps rendering the
 * prior `report` state.
 *
 * This hook is "preserve current behaviour" by design. The two open
 * product questions on the override-on-every-result and the auto-PDF
 * trigger were resolved in favour of preserving today's behaviour
 * unchanged. Either can be revisited via a follow-up flag without
 * re-extracting the bridge.
 */

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from 'react'
import type { RightPanelView, ValuationReportData } from '@/components/calculator'
import { usePreparerMultipleStore } from '@/store/manual/usePreparerMultipleStore'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import { generalLogger } from '@/utils/logger'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'
import {
  mapValuationResultToReport,
  type ReportTranslator,
} from '../utils/mapValuationResultToReport'
import { useLatestRef } from './useNavigationCancellation'

export interface UseResultToReportBridgeParams {
  /** Latest API response. `null`/`undefined` ⇒ the effect no-ops. */
  result: ValuationResponse | null | undefined
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
  /** Live draft status — skip persisted hints while a durable save is in flight. */
  draftStatus: 'draft' | 'saved' | 'saving'
  /** Synchronous guard set before Zustand result updates during PUT /result. */
  durableSaveInFlightRef: MutableRefObject<boolean>
  /** Parent-callback fired after the bridge maps the result. */
  onComplete: (result: ValuationResponse) => void
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  setDraftStatus: Dispatch<SetStateAction<'draft' | 'saved' | 'saving'>>
  setLastSaved: Dispatch<SetStateAction<Date | undefined>>
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>
  setShowFullscreenModal: Dispatch<SetStateAction<boolean>>
  /** `usePdfGeneration().generatePdf` — fired in background on first map. */
  generatePdf: (() => Promise<unknown>) | undefined
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
    selectedMethod,
    clientBlendedValue,
    reportId,
    canDownloadPdf,
    isMobile,
    draftStatus,
    durableSaveInFlightRef,
    tReport,
    onComplete,
    setReport,
    setDraftStatus,
    setLastSaved,
    setRightPanelView,
    setShowFullscreenModal,
    generatePdf,
  } = params

  const generatePdfRef = useLatestRef(generatePdf)
  const lastPdfTriggerFingerprintRef = useRef<string | null>(null)

  useEffect(() => {
    lastPdfTriggerFingerprintRef.current = null
  }, [reportId])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- setter and `tReport` references are stable in practice; including them re-fires this expensive effect on every parent render.
  useEffect(() => {
    if (!result) return
    try {
      // 1. Preparer-multiple store sync.
      usePreparerMultipleStore.getState().syncFromValuationResult(result)
      // 2. Parent-callback.
      onComplete(result)

      // Build the report projection (pure).
      const mappedReport = mapValuationResultToReport({
        result,
        selectedMethod,
        clientBlendedValue,
        reportId,
        canDownloadPdf,
        tReport,
      })

      // 3-5. Drop into panel state. Durable-save flows set status after PUT /result.
      setReport(mappedReport)
      if (draftStatus !== 'saving' && !durableSaveInFlightRef.current) {
        setDraftStatus('saved')
        setLastSaved(new Date())
      }

      // 6. Switch panel view to preview. PRESERVED: overrides prior user
      //    navigation; documented as intentional pending product review.
      setRightPanelView('preview')

      // 7. Mobile fullscreen.
      if (isMobile && mappedReport.htmlReport) {
        setShowFullscreenModal(true)
      }

      // 8. Background PDF generation — only when PDF is stale and fingerprint changed
      // (guards against poll merges re-firing POST /pdf).
      if (reportId && mappedReport.htmlReport && canDownloadPdf && isPdfLikelyStaleVenus(mappedReport)) {
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
    onComplete,
    reportId,
    generatePdfRef,
    isMobile,
    draftStatus,
    durableSaveInFlightRef,
    selectedMethod,
    canDownloadPdf,
    setDraftStatus,
    setLastSaved,
    setReport,
    setRightPanelView,
    setShowFullscreenModal,
    tReport,
  ])
}
