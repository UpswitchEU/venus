/**
 * mapValuationResultToReport — pure projection from the Venus API result
 * (`ValuationResponse`) to the Clarity-shaped `ValuationReportData` the
 * right panel and assistant render against.
 *
 * Extracted in Phase 4c.2 Hook 2 from the 110-line "Bridge: Result → Report"
 * effect in `ManualValuationWorkspace.tsx`. Pure: no setState, no stores, no toasts,
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
import type { ValuationResponse } from '@/types/valuation'
import { parseFinancialTransportNumber } from '@/utils/financialTransport'
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
  /** Active session HTML (may lead result.html_report after self-heal). */
  sessionHtmlReport?: string | null
  /** Standalone store HTML when not yet merged into result. */
  standaloneHtmlReport?: string | null
  /** Current selected method (drives DCF readiness exposure). */
  selectedMethod: string
  /** The route's reportId. Used as a fallback id when the response omits one. */
  reportId: string | undefined
  /** Plan/firm PDF gate. Suppresses `pdfUrl` when false. */
  canDownloadPdf: boolean
  /** Narrowed translator from `useTranslations('reportPanel')`. */
  tReport: ReportTranslator
  /** @deprecated Monetary synthesis is read only from ValuationIQ. */
  clientBlendedValue?: number | null
}

type ReportResultRecord = Record<string, unknown> & {
  current_year_data?: {
    ebitda?: unknown
    revenue?: unknown
    reported_ebitda?: unknown
    normalized_ebitda?: unknown
    ebitda_normalization_metadata?: { reported_ebitda?: unknown; normalized_ebitda?: unknown }
  }
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
  render_fingerprint?: unknown
  pdf_render_fingerprint?: unknown
  pdf_coherent?: unknown
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
  const {
    result,
    sessionHtmlReport,
    standaloneHtmlReport,
    selectedMethod,
    reportId,
    canDownloadPdf,
    tReport,
    clientBlendedValue,
  } = opts
  const r = result as unknown as ReportResultRecord

  const presentation = deriveManualReportPresentation(result, selectedMethod, {
    clientBlendedValue,
  })
  const financials = r.current_year_data
  const ebitda =
    parseFinancialTransportNumber(financials?.reported_ebitda) ??
    parseFinancialTransportNumber(financials?.ebitda_normalization_metadata?.reported_ebitda) ??
    parseFinancialTransportNumber(financials?.ebitda)
  const latestNormRaw = r.latest_normalized_ebitda
  const normalizedEbitda =
    parseFinancialTransportNumber(latestNormRaw) ??
    parseFinancialTransportNumber(financials?.normalized_ebitda) ??
    parseFinancialTransportNumber(financials?.ebitda_normalization_metadata?.normalized_ebitda) ??
    parseFinancialTransportNumber(financials?.ebitda) ??
    ebitda
  const revenue = parseFinancialTransportNumber(financials?.revenue)
  const currency =
    typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency.trim().toUpperCase())
      ? r.currency.trim().toUpperCase()
      : null
  const revenueLabel =
    revenue != null && currency != null
      ? new Intl.NumberFormat('en-BE', {
          style: 'currency',
          currency,
          notation: 'compact',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(revenue)
      : '—'
  const p25 = parseFinancialTransportNumber(r.multiples_valuation?.p25_ebitda_multiple)
  const p75 = parseFinancialTransportNumber(r.multiples_valuation?.p75_ebitda_multiple)
  const rawConfidence = r.overall_confidence ?? r.details?.overall_confidence
  const confidence =
    typeof rawConfidence === 'string' &&
    ['high', 'medium', 'low'].includes(rawConfidence.toLowerCase())
      ? (rawConfidence.toLowerCase() as 'high' | 'medium' | 'low')
      : undefined

  const askingRaw = r.recommended_asking_price ?? r.details?.recommended_asking_price
  const parsedAsking = parseFinancialTransportNumber(askingRaw)
  const recommendedAskingPrice =
    presentation.valuation != null && parsedAsking != null && parsedAsking >= 0
      ? parsedAsking
      : undefined
  const htmlReport = getFirstRenderableReportHtml(
    readOptionalString(r.html_report),
    readOptionalString(r.htmlReport),
    readOptionalString(r.details?.html_report),
    sessionHtmlReport,
    standaloneHtmlReport
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
    currency,
    valueBasis: presentation.valueBasis,
    valuation: presentation.valuation,
    valuationLow:
      presentation.valuationLow != null && Number.isFinite(presentation.valuationLow)
        ? presentation.valuationLow
        : undefined,
    valuationHigh:
      presentation.valuationHigh != null && Number.isFinite(presentation.valuationHigh)
        ? presentation.valuationHigh
        : undefined,
    ebitda: ebitda ?? null,
    normalizedEbitda,
    multiple: presentation.multiple ?? null,
    multipleRange:
      presentation.multipleRange ??
      (p25 != null && p75 != null && p25 <= p75 ? { low: p25, high: p75 } : undefined),
    generatedAt: new Date(),
    confidenceLevel: confidence,
    htmlReport: htmlReport || undefined,
    dcfHistoricalFcfReadiness:
      dcfHistoricalFcfReadiness as ValuationReportData['dcfHistoricalFcfReadiness'],
    recommendedAskingPrice:
      presentation.valueBasis === 'enterprise_value'
        ? undefined
        : (recommendedAskingPrice ?? undefined),
    metrics: [
      {
        label: tReport('metrics.avgRevenue'),
        value: revenueLabel,
      },
      {
        label: tReport('metrics.ebitdaMargin'),
        value:
          ebitda != null && revenue != null && revenue !== 0
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
    renderFingerprint: readOptionalString(r.render_fingerprint) ?? null,
    pdfRenderFingerprint: readOptionalString(r.pdf_render_fingerprint) ?? null,
    pdfCoherent: typeof r.pdf_coherent === 'boolean' ? r.pdf_coherent : null,
  }
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
