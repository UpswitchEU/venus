import type { ValuationReportData } from '@/components/calculator'
import type { ValuationResponse } from '@/types/valuation'
import { hydrateClientValuationResultsMap } from '@/utils/extractValuationResultsMap'
import { getRenderableReportHtmlFromCurrentOrFallback } from '@/utils/safetyNetReportHtml'
import {
  resolveSynthesisAwarePresentation,
  shouldAlignRecommendedAskingWithSynthesis,
} from '../components/manualReportPresentation'

export interface PdfStalePresentationState {
  selectedMethod: string
  preSelectedMethods: readonly string[]
  userWeights: Record<string, number>
}

export type PdfStaleReportPatch = Pick<
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
>

export function mergePolledResultWithExisting(
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

export function reportPatchFromFreshResponse(
  fresh: ValuationResponse,
  canDownloadPdf: boolean,
  presentationState: PdfStalePresentationState
): PdfStaleReportPatch {
  const presentation = resolveSynthesisAwarePresentation(fresh, presentationState.selectedMethod, {
    preSelectedMethods: presentationState.preSelectedMethods,
    userWeights: presentationState.userWeights,
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
      preSelectedMethods: presentationState.preSelectedMethods,
      userWeights: presentationState.userWeights,
    })
      ? { recommendedAskingPrice: presentation.valuation }
      : {}),
  }
}
