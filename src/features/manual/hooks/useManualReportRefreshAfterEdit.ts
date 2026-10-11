import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react'
import type { ValuationReportData } from '../../../components/calculator'
import { backendAPI } from '../../../services/backendApi'
import { useManualResultsStore } from '../../../store/manual'
import { APIError } from '../../../types/errors'
import type { ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { watchReportAccessScope } from '../../../utils/reportAccessScope'
import { getRenderableReportHtml } from '../../../utils/safetyNetReportHtml'
import { isPdfLikelyStaleVenus, type PdfStalenessMeta } from '../utils/isPdfLikelyStaleVenus'
import {
  mergePolledResultWithExisting,
  reportPatchFromFreshResponse,
} from './usePdfStalenessLifecycleReportPatch'

type ManualPdfGenerator = () => Promise<string | null>

export interface UseManualReportRefreshAfterEditParams {
  canDownloadPdf: boolean
  generatePdf?: ManualPdfGenerator
  /** Skip kicking a second job while async PDF generation is already in flight. */
  isPdfGenerating?: boolean
  persistedReportLookupId?: string | null
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  setResult: (result: ValuationResponse | null) => void
}

export interface UseManualReportRefreshAfterEditResult {
  refreshReportAfterEdit: (htmlFromPatch?: string) => Promise<boolean>
}

export function useManualReportRefreshAfterEdit({
  canDownloadPdf,
  generatePdf,
  isPdfGenerating = false,
  persistedReportLookupId,
  setReport,
  setResult,
}: UseManualReportRefreshAfterEditParams): UseManualReportRefreshAfterEditResult {
  const lifecycle = useRef(0)
  const requestSequence = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    // A return to the same lookup ID still starts a new lifecycle.
    void persistedReportLookupId
    mounted.current = true
    return () => {
      mounted.current = false
      lifecycle.current += 1
    }
  }, [persistedReportLookupId])

  const refreshReportAfterEdit = useCallback(
    async (htmlFromPatch?: string) => {
      if (!persistedReportLookupId || !mounted.current) return false
      const generation = lifecycle.current
      const request = ++requestSequence.current
      const access = watchReportAccessScope()
      let expectedResult = useManualResultsStore.getState().result
      const isCurrent = () =>
        mounted.current &&
        lifecycle.current === generation &&
        requestSequence.current === request &&
        access.isCurrent() &&
        useManualResultsStore.getState().result === expectedResult

      try {
        const fresh = await backendAPI.getReport(persistedReportLookupId)
        if (!isCurrent()) return false
        const mergedResult = mergePolledResultWithExisting(fresh, expectedResult)
        const patch = reportPatchFromFreshResponse(
          mergedResult,
          canDownloadPdf,
          useManualResultsStore.getState()
        )

        setResult(mergedResult)
        expectedResult = useManualResultsStore.getState().result
        setReport((prev) =>
          prev && isCurrent() ? { ...prev, ...patch, htmlReport: mergedResult.html_report } : prev
        )

        // The GET is newer than the edit response. Its HTML and fingerprint
        // travel together; an earlier patch must not replace that snapshot.
        if (mergedResult.html_report && isCurrent()) {
          regeneratePdfAfterValuationEdit({
            canDownloadPdf,
            generatePdf,
            isPdfGenerating,
            reportMeta: patch,
          })
        }
        return true
      } catch (refreshErr) {
        if (!isCurrent()) return false
        generalLogger.warn('[ManualValuationWorkspace] getReport after valuation edit failed', {
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        })

        const renderableHtmlFromPatch = getRenderableReportHtml(htmlFromPatch)
        if (renderableHtmlFromPatch) {
          // The patch can recover the preview, but cannot certify an old export.
          setResult(
            expectedResult
              ? {
                  ...expectedResult,
                  html_report: renderableHtmlFromPatch,
                  pdf_url: undefined,
                  pdf_generated_at: null,
                  render_fingerprint: undefined,
                  pdf_render_fingerprint: null,
                  pdf_coherent: false,
                }
              : expectedResult
          )
          expectedResult = useManualResultsStore.getState().result
          setReport((prev) =>
            prev && isCurrent()
              ? {
                  ...prev,
                  htmlReport: renderableHtmlFromPatch,
                  pdfUrl: undefined,
                  pdfGeneratedAt: null,
                  renderFingerprint: null,
                  pdfRenderFingerprint: null,
                  pdfCoherent: false,
                }
              : prev
          )
          regeneratePdfAfterValuationEdit({
            canDownloadPdf,
            generatePdf,
            isPdfGenerating,
            forceRegenerate: true,
          })
        }
        return false
      } finally {
        access.dispose()
      }
    },
    [canDownloadPdf, generatePdf, isPdfGenerating, persistedReportLookupId, setReport, setResult]
  )

  return { refreshReportAfterEdit }
}

function regeneratePdfAfterValuationEdit({
  canDownloadPdf,
  generatePdf,
  isPdfGenerating = false,
  reportMeta,
  forceRegenerate = false,
}: {
  canDownloadPdf: boolean
  generatePdf?: ManualPdfGenerator
  isPdfGenerating?: boolean
  reportMeta?: PdfStalenessMeta
  forceRegenerate?: boolean
}) {
  if (!canDownloadPdf || !generatePdf || isPdfGenerating) return
  if (!forceRegenerate && reportMeta && !isPdfLikelyStaleVenus(reportMeta)) return

  generatePdf().catch((err: unknown) => {
    if (err instanceof APIError && err.statusCode === 402) return
    generalLogger.warn('[ManualValuationWorkspace] PDF re-generation after valuation edit failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  })
}
