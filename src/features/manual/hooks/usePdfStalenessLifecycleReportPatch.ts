import type { ValuationReportData } from '@/components/calculator'
import type { ValuationResponse } from '@/types/valuation'
import { hydrateClientValuationResultsMap } from '@/utils/extractValuationResultsMap'
import { getRenderableReportHtmlFromCurrentOrFallback } from '@/utils/safetyNetReportHtml'
import { getRecommendedAskingPrice } from '@/utils/valuationResultAccess'
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
  | 'valueBasis'
  | 'valuation'
  | 'valuationLow'
  | 'valuationHigh'
  | 'recommendedAskingPrice'
>

export function mergePolledResultWithExisting(
  fresh: ValuationResponse,
  latestExistingResult: ValuationResponse | null | undefined
): ValuationResponse {
  const compatible = isSameEconomicSnapshot(fresh, latestExistingResult)
  const fallback = compatible ? latestExistingResult : null
  const nextValuationResults =
    hydrateClientValuationResultsMap(fresh) ?? hydrateClientValuationResultsMap(fallback ?? null)
  return {
    ...(fallback || {}),
    ...fresh,
    html_report: getRenderableReportHtmlFromCurrentOrFallback(
      [fresh.html_report],
      [fallback?.html_report],
      {
        currentRenderFingerprint: fresh.render_fingerprint,
        fallbackRenderFingerprint: fallback?.render_fingerprint,
      }
    ),
    valuation_results: nextValuationResults ?? undefined,
    fiscal_4x_anchor: fresh.fiscal_4x_anchor ?? fallback?.fiscal_4x_anchor ?? null,
    multiple_adjustment_summary:
      fresh.multiple_adjustment_summary || fallback?.multiple_adjustment_summary,
    // Export readiness is always the server's current observation.
    pdf_url: fresh.pdf_url,
    pdf_generated_at: fresh.pdf_generated_at,
    pdf_render_fingerprint: fresh.pdf_render_fingerprint,
    pdf_coherent: fresh.pdf_coherent,
  } as ValuationResponse
}

function isSameEconomicSnapshot(
  fresh: ValuationResponse,
  existing: ValuationResponse | null | undefined
): boolean {
  if (!existing) return false
  const run = fresh.valuation_id?.trim()
  const previousRun = existing.valuation_id?.trim()
  if (run && previousRun && run !== previousRun) return false
  const fingerprint = fresh.render_fingerprint?.trim()
  const previousFingerprint = existing.render_fingerprint?.trim()
  if (fingerprint || previousFingerprint) {
    return !!fingerprint && fingerprint === previousFingerprint
  }
  // Legacy responses lack fingerprints. A different revision or unknown run
  // cannot borrow financial evidence from the previously displayed result.
  return !!run && run === previousRun && fresh.updated_at === existing.updated_at
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
    valueBasis: presentation.valueBasis,
    valuationLow: presentation.valuationLow,
    valuationHigh: presentation.valuationHigh,
    ...(presentation.valuation == null || presentation.valueBasis === 'enterprise_value'
      ? { recommendedAskingPrice: undefined }
      : shouldAlignRecommendedAskingWithSynthesis(fresh, {
            preSelectedMethods: presentationState.preSelectedMethods,
            userWeights: presentationState.userWeights,
          })
        ? { recommendedAskingPrice: presentation.valuation }
        : { recommendedAskingPrice: getRecommendedAskingPrice(fresh) ?? undefined }),
  }
}
