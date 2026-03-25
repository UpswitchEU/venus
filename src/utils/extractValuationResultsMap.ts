/**
 * Client-side parity with Titan `extractValuationResultsMap`.
 * Legacy payloads may store `{}` at `valuation_results` while real methods live under
 * `details`, `report_context`, or nested `valuation_result`.
 *
 * Adaptive: `report_context.applied_multiple` is canonical; `normalizeAdaptiveMethod` fixes stale
 * persisted `upswitch_adaptive.multiple_used` on legacy saves.
 */
function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getCanonicalReportContext(
  valuationResult: Record<string, any>
): Record<string, any> | null {
  const vr = valuationResult.valuation_result
  const nested = vr && typeof vr === 'object' ? (vr as Record<string, any>) : null
  const candidates = [
    valuationResult.report_context,
    valuationResult.details?.report_context,
    nested?.report_context,
    nested?.details?.report_context,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, any>
    }
  }
  return null
}

function normalizeAdaptiveMethod(
  map: Record<string, any>,
  valuationResult: Record<string, any>
): Record<string, any> {
  const adaptive = map.upswitch_adaptive
  if (!adaptive || typeof adaptive !== 'object') return map

  const reportContext = getCanonicalReportContext(valuationResult)
  const canonicalMultiple =
    toFiniteNumber(reportContext?.applied_multiple) ??
    toFiniteNumber(valuationResult.valuation_result?.multiple) ??
    toFiniteNumber(valuationResult.multiple) ??
    null
  const multipleLow = toFiniteNumber(reportContext?.multiple_low)
  const multipleHigh = toFiniteNumber(reportContext?.multiple_high)
  const details =
    adaptive.details && typeof adaptive.details === 'object' && !Array.isArray(adaptive.details)
      ? { ...adaptive.details }
      : {}

  if (multipleLow != null && details.p25_multiple == null) {
    details.p25_multiple = multipleLow
  }
  if (multipleHigh != null && details.p75_multiple == null) {
    details.p75_multiple = multipleHigh
  }

  return {
    ...map,
    upswitch_adaptive: {
      ...adaptive,
      ...(canonicalMultiple != null ? { multiple_used: canonicalMultiple } : {}),
      details,
    },
  }
}

export function extractValuationResultsMap(
  valuationResult: Record<string, any> | null | undefined
): Record<string, any> | null {
  if (!valuationResult || typeof valuationResult !== 'object') return null

  const vr = valuationResult.valuation_result
  const nested = vr && typeof vr === 'object' ? (vr as Record<string, any>) : null

  const candidates = [
    valuationResult.valuation_results,
    valuationResult.details?.valuation_results,
    nested?.valuation_results,
    nested?.details?.valuation_results,
    valuationResult.report_context?.valuation_results,
    valuationResult.details?.report_context?.valuation_results,
    nested?.report_context?.valuation_results,
    nested?.details?.report_context?.valuation_results,
  ]

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length > 0
    ) {
      return normalizeAdaptiveMethod(candidate as Record<string, any>, valuationResult)
    }
  }

  return null
}
