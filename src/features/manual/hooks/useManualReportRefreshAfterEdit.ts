import { type Dispatch, type SetStateAction, useCallback } from 'react'
import type { ValuationReportData } from '../../../components/calculator'
import { backendAPI } from '../../../services/backendApi'
import { useManualResultsStore } from '../../../store/manual'
import { APIError } from '../../../types/errors'
import type { ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import {
  getFirstRenderableReportHtml,
  getRenderableReportHtml,
  getRenderableReportHtmlFromCurrentOrFallback,
} from '../../../utils/safetyNetReportHtml'
import { getManualHydratedValuationResults } from '../utils/manualLayoutAdapters'
import { isPdfLikelyStaleVenus } from '../utils/isPdfLikelyStaleVenus'

type ManualPdfGenerator = () => Promise<string | null>

export interface UseManualReportRefreshAfterEditParams {
  canDownloadPdf: boolean
  generatePdf?: ManualPdfGenerator
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
  persistedReportLookupId,
  setReport,
  setResult,
}: UseManualReportRefreshAfterEditParams): UseManualReportRefreshAfterEditResult {
  const refreshReportAfterEdit = useCallback(
    async (htmlFromPatch?: string) => {
      if (!persistedReportLookupId) return false

      try {
        const fresh = await backendAPI.getReport(persistedReportLookupId)
        const latestExistingResult = useManualResultsStore.getState().result
        const nextValuationResults =
          getManualHydratedValuationResults(fresh) ??
          getManualHydratedValuationResults(latestExistingResult)
        const mergedResult: ValuationResponse = {
          ...(latestExistingResult || {}),
          ...fresh,
          html_report: getRenderableReportHtmlFromCurrentOrFallback(
            [htmlFromPatch, fresh.html_report],
            [latestExistingResult?.html_report],
            {
              currentRenderFingerprint: fresh.render_fingerprint,
              fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
            }
          ),
          valuation_results: nextValuationResults ?? undefined,
          fiscal_4x_anchor:
            fresh.fiscal_4x_anchor ?? latestExistingResult?.fiscal_4x_anchor ?? null,
          multiple_adjustment_summary:
            fresh.multiple_adjustment_summary || latestExistingResult?.multiple_adjustment_summary,
        }

        setResult(mergedResult)
        const htmlForPreview = getFirstRenderableReportHtml(htmlFromPatch, fresh.html_report)
        setReport((prev) => {
          if (!prev) return prev

          const nextHtmlReport = getRenderableReportHtmlFromCurrentOrFallback(
            [htmlFromPatch, fresh.html_report],
            [prev.htmlReport],
            {
              currentRenderFingerprint: fresh.render_fingerprint,
              fallbackRenderFingerprint: latestExistingResult?.render_fingerprint,
            }
          )
          const pdfMeta: Pick<
            ValuationReportData,
            'reportUpdatedAt' | 'pdfGeneratedAt' | 'pdfUrl'
          > = {
            reportUpdatedAt: fresh.updated_at
              ? new Date(String(fresh.updated_at))
              : prev.reportUpdatedAt,
            pdfGeneratedAt:
              fresh.pdf_generated_at != null && String(fresh.pdf_generated_at) !== ''
                ? new Date(String(fresh.pdf_generated_at))
                : null,
            pdfUrl: canDownloadPdf && typeof fresh.pdf_url === 'string' ? fresh.pdf_url : undefined,
          }

          return { ...prev, htmlReport: nextHtmlReport, ...pdfMeta }
        })

        if (htmlForPreview) {
          regeneratePdfAfterValuationEdit({
            canDownloadPdf,
            generatePdf,
            reportMeta: {
              reportUpdatedAt: fresh.updated_at
                ? new Date(String(fresh.updated_at))
                : undefined,
              pdfGeneratedAt:
                fresh.pdf_generated_at != null && String(fresh.pdf_generated_at) !== ''
                  ? new Date(String(fresh.pdf_generated_at))
                  : null,
              pdfUrl: canDownloadPdf && typeof fresh.pdf_url === 'string' ? fresh.pdf_url : undefined,
            },
          })
        }

        return true
      } catch (refreshErr) {
        generalLogger.warn('[ManualLayout] getReport after valuation edit failed', {
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        })

        const renderableHtmlFromPatch = getRenderableReportHtml(htmlFromPatch)
        if (renderableHtmlFromPatch) {
          setReport((prev) => (prev ? { ...prev, htmlReport: renderableHtmlFromPatch } : prev))
          const latestResult = useManualResultsStore.getState().result
          setResult(
            latestResult ? { ...latestResult, html_report: renderableHtmlFromPatch } : latestResult
          )
          regeneratePdfAfterValuationEdit({
            canDownloadPdf,
            generatePdf,
            // HTML came from patch fallback — PDF is stale by definition.
            forceRegenerate: true,
          })
        }

        return false
      }
    },
    [canDownloadPdf, generatePdf, persistedReportLookupId, setReport, setResult]
  )

  return { refreshReportAfterEdit }
}

function regeneratePdfAfterValuationEdit({
  canDownloadPdf,
  generatePdf,
  reportMeta,
  forceRegenerate = false,
}: {
  canDownloadPdf: boolean
  generatePdf?: ManualPdfGenerator
  reportMeta?: Pick<ValuationReportData, 'reportUpdatedAt' | 'pdfGeneratedAt' | 'pdfUrl'>
  forceRegenerate?: boolean
}) {
  if (!canDownloadPdf || !generatePdf) return
  if (!forceRegenerate && reportMeta && !isPdfLikelyStaleVenus(reportMeta)) return

  generatePdf().catch((err: unknown) => {
    if (err instanceof APIError && err.statusCode === 402) return
    generalLogger.warn('[ManualLayout] PDF re-generation after valuation edit failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  })
}
