/**
 * mapValuationResultToReport — pure projection from the Venus API result
 * (`ValuationResponse`) to the Clarity-shaped `ValuationReportData` the
 * right panel and assistant render against.
 *
 * Extracted in Phase 4c.2 Hook 2 from the 110-line "Bridge: Result → Report"
 * effect in `ManualLayout.tsx`. Pure: no setState, no stores, no toasts,
 * no fetches. Side effects (preparer store sync, `onComplete`, panel-view
 * switch, auto-PDF-gen) live in the consuming hook
 * (`useResultToReportBridge`). The pure mapper is testable in isolation.
 *
 * Behaviour pinned: the field-derivation logic is lifted verbatim from
 * the original effect, including the DCF-readiness exposure rule (DCF or
 * weighted-synthesis result both expose the historical-FCF-readiness
 * surface) and the multiples-range fallback (presentation override →
 * `p25`/`p75` from `multiples_valuation` → undefined).
 */

import type { ValuationReportData } from '@/components/calculator'
import { coalesceFiniteNumber } from '@/lib/omniPreview'
import type { ValuationResponse } from '@/types/valuation'
import { getFirstRenderableReportHtml } from '@/utils/safetyNetReportHtml'
import { deriveManualReportPresentation } from '../components/manualReportPresentation'
import { resultHasWeightedSynthesisSignal } from './weightedSynthesisSignals'

/** Translation keys consumed by the mapper. Narrowed for type safety. */
export type ReportTranslationKey =
  | 'defaultCompanyName'
  | 'defaultSector'
  | 'metrics.avgRevenue'
  | 'metrics.ebitdaMargin'
  | 'metrics.sector'

export type ReportTranslator = (key: ReportTranslationKey) => string

export interface MapValuationResultToReportOpts {
  /** Raw API response. Must be non-null — caller is responsible for the gate. */
  result: ValuationResponse
  /** Current selected method (drives DCF readiness exposure). */
  selectedMethod: string
  /** The route's reportId. Used as a fallback id when the response omits one. */
  reportId: string | undefined
  /** Plan/firm PDF gate. Suppresses `pdfUrl` when false. */
  canDownloadPdf: boolean
  /** Narrowed translator from `useTranslations('reportPanel')`. */
  tReport: ReportTranslator
  /** Live Waarderingssynthese blend (current weights); wins over single-method headline. */
  clientBlendedValue?: number | null
}

type ReportResultRecord = Record<string, unknown> & {
  current_year_data?: { ebitda?: unknown; revenue?: unknown }
  multiples_valuation?: {
    p25_ebitda_multiple?: unknown
    p75_ebitda_multiple?: unknown
  }
  details?: {
    overall_confidence?: unknown
    recommended_asking_price?: unknown
    html_report?: unknown
    dcf_valuation?: { historical_fcf_readiness?: unknown }
    business_type?: unknown
  }
  dcf_valuation?: { historical_fcf_readiness?: unknown }
  report_context?: { selected_valuation_method?: unknown }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Pure mapping function. Returns the `ValuationReportData` to feed into
 * `setReport`. Caller is responsible for any subsequent side effects.
 */
export function mapValuationResultToReport(
  opts: MapValuationResultToReportOpts
): ValuationReportData {
  const { result, selectedMethod, reportId, canDownloadPdf, tReport, clientBlendedValue } = opts
  const r = result as unknown as ReportResultRecord

  const presentation = deriveManualReportPresentation(result, selectedMethod, {
    clientBlendedValue,
  })
  const ebitda = coalesceFiniteNumber(r.current_year_data?.ebitda)
  const latestNormRaw = r.latest_normalized_ebitda
  const normalizedEbitda =
    latestNormRaw != null && Number.isFinite(Number(latestNormRaw)) ? Number(latestNormRaw) : ebitda
  const revenue = coalesceFiniteNumber(r.current_year_data?.revenue)
  const p25 = coalesceFiniteNumber(r.multiples_valuation?.p25_ebitda_multiple)
  const p75 = coalesceFiniteNumber(r.multiples_valuation?.p75_ebitda_multiple)
  const rawConfidence = r.overall_confidence ?? r.details?.overall_confidence
  const confidence =
    typeof rawConfidence === 'string'
      ? (rawConfidence.toLowerCase() as 'high' | 'medium' | 'low')
      : undefined

  const askingRaw = r.recommended_asking_price ?? r.details?.recommended_asking_price
  const askingPrice =
    askingRaw != null && Number.isFinite(Number(askingRaw)) ? Number(askingRaw) : undefined
  const hasSynthesisHeadline =
    clientBlendedValue != null || resultHasWeightedSynthesisSignal(r as Record<string, unknown>)
  const recommendedAskingPrice = hasSynthesisHeadline
    ? presentation.valuation
    : askingPrice ?? presentation.valuation
  const htmlReport = getFirstRenderableReportHtml(
    readOptionalString(r.html_report),
    readOptionalString(r.details?.html_report)
  )
  const shouldExposeDcfReadiness =
    isDcfOrHybridMethodSignal(selectedMethod) ||
    isDcfOrHybridMethodSignal(r.selected_valuation_method) ||
    isDcfOrHybridMethodSignal(r.report_context?.selected_valuation_method) ||
    resultHasWeightedSynthesisSignal(r as Record<string, unknown>)
  const dcfHistoricalFcfReadiness = shouldExposeDcfReadiness
    ? (r.dcf_valuation?.historical_fcf_readiness ??
      r.details?.dcf_valuation?.historical_fcf_readiness ??
      null)
    : null

  return {
    id: reportId || readOptionalString(r.valuation_id) || readOptionalString(r.id) || 'draft',
    companyName:
      readOptionalString(r.company_name) ||
      readOptionalString(r.business_name) ||
      tReport('defaultCompanyName'),
    valuation: presentation.valuation,
    valuationLow:
      presentation.valuationLow != null && Number.isFinite(presentation.valuationLow)
        ? presentation.valuationLow
        : undefined,
    valuationHigh:
      presentation.valuationHigh != null && Number.isFinite(presentation.valuationHigh)
        ? presentation.valuationHigh
        : undefined,
    ebitda,
    normalizedEbitda: Number.isFinite(normalizedEbitda) ? normalizedEbitda : undefined,
    multiple: presentation.multiple ?? 0,
    multipleRange:
      presentation.multipleRange ??
      (p25 != null && p75 != null ? { low: p25, high: p75 } : undefined),
    generatedAt: new Date(),
    confidenceLevel: confidence || 'medium',
    htmlReport: htmlReport || undefined,
    dcfHistoricalFcfReadiness:
      dcfHistoricalFcfReadiness as ValuationReportData['dcfHistoricalFcfReadiness'],
    recommendedAskingPrice,
    metrics: [
      {
        label: tReport('metrics.avgRevenue'),
        value: `€${(revenue / 1_000_000).toFixed(2)}M`,
      },
      {
        label: tReport('metrics.ebitdaMargin'),
        value:
          revenue !== 0 && Number.isFinite(revenue)
            ? `${((ebitda / revenue) * 100).toFixed(1)}%`
            : '—',
      },
      {
        label: tReport('metrics.sector'),
        value:
          readOptionalString(r.business_type) ||
          readOptionalString(r.details?.business_type) ||
          tReport('defaultSector'),
      },
    ],
    reportUpdatedAt: r.updated_at ? new Date(String(r.updated_at)) : undefined,
    pdfGeneratedAt:
      r.pdf_generated_at != null && String(r.pdf_generated_at) !== ''
        ? new Date(String(r.pdf_generated_at))
        : null,
    pdfUrl: canDownloadPdf && typeof r.pdf_url === 'string' ? r.pdf_url : undefined,
  } as ValuationReportData
}

/**
 * True when `value` (or any of its API alias forms) names DCF or a hybrid
 * DCF-bearing valuation method. Used to gate the DCF historical-FCF
 * readiness panel — readiness only matters when DCF is in the result.
 */
export function isDcfOrHybridMethodSignal(value: unknown): boolean {
  if (value == null) return false
  const normalized = String(value).trim().toLowerCase().replace(/-/g, '_').split(/\s+/).join('_')
  return (
    normalized === 'dcf' ||
    normalized === 'dcf_analysis' ||
    normalized === 'discounted_cash_flow' ||
    /^discounted_cash_flow_?\(?dcf\)?$/.test(normalized) ||
    normalized === 'hybrid' ||
    normalized === 'hybrid_dcf' ||
    normalized === 'hybrid_valuation'
  )
}

export { resultHasWeightedSynthesisSignal } from './weightedSynthesisSignals'
