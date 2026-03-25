import type { ValuationResponse } from '../../../types/valuation'
import { extractValuationResultsMap } from '../../../utils/extractValuationResultsMap'

type ManualPresentation = {
  valuation: number
  valuationLow?: number
  valuationHigh?: number
  multiple?: number
  multipleRange?: { low: number; high: number }
}

export function deriveManualReportPresentation(
  result: ValuationResponse | null | undefined,
  selectedMethod?: string | null
): ManualPresentation {
  const r = result as any
  if (!r) return { valuation: 0 }

  const valuationResult = r.valuation_result ?? {}
  const reportContext = r.report_context ?? valuationResult?.report_context ?? r.details?.report_context ?? {}
  const hydrated = extractValuationResultsMap(r as Record<string, any> | null | undefined) ?? {}
  const methodKey =
    selectedMethod ?? r.selected_valuation_method ?? r.selectedMethod ?? 'upswitch_adaptive'
  const methodData = hydrated[methodKey]
  const methodDetails =
    methodData?.details && typeof methodData.details === 'object' ? methodData.details : {}

  const valuation =
    Number(methodData?.value ?? r.equity_value_mid ?? r.valuation_midpoint ?? r.details?.equity_value_mid) || 0
  const valuationLowRaw =
    methodDetails.equity_range_low ?? r.equity_value_low ?? r.valuation_min ?? r.details?.equity_value_low
  const valuationHighRaw =
    methodDetails.equity_range_high ?? r.equity_value_high ?? r.valuation_max ?? r.details?.equity_value_high
  const multipleRaw =
    methodData?.multiple_used ??
    valuationResult?.multiple ??
    reportContext?.applied_multiple ??
    r.multiples_valuation?.ebitda_multiple
  const multipleLowRaw =
    methodDetails.p25_multiple ?? valuationResult?.multipleRange?.low ?? reportContext?.multiple_low
  const multipleHighRaw =
    methodDetails.p75_multiple ?? valuationResult?.multipleRange?.high ?? reportContext?.multiple_high

  return {
    valuation,
    valuationLow:
      valuationLowRaw != null ? Number(valuationLowRaw) || 0 : valuation ? Math.round(valuation * 0.8) : undefined,
    valuationHigh:
      valuationHighRaw != null ? Number(valuationHighRaw) || 0 : valuation ? Math.round(valuation * 1.2) : undefined,
    multiple: multipleRaw != null ? Number(multipleRaw) || 0 : undefined,
    multipleRange:
      multipleLowRaw != null && multipleHighRaw != null
        ? {
            low: Number(multipleLowRaw) || 0,
            high: Number(multipleHighRaw) || 0,
          }
        : undefined,
  }
}
