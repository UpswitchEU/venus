/**
 * Client-side parity with Titan `extractValuationResultsMap`.
 * Legacy payloads may store `{}` at `valuation_results` while real methods live under
 * `details`, `report_context`, or nested `valuation_result`.
 */
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
      return candidate as Record<string, any>
    }
  }

  return null
}
