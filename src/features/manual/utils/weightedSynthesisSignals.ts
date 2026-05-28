/**
 * Detect weighted Waarderingssynthese payloads on valuation API responses.
 */

export function resultHasWeightedSynthesisSignal(result: Record<string, unknown>): boolean {
  const details = result.details as Record<string, unknown> | undefined
  const valuationResult = result.valuation_result as Record<string, unknown> | undefined
  const valuationResultDetails = valuationResult?.details as Record<string, unknown> | undefined
  const candidates = [
    result,
    result.weighted_valuation,
    details,
    result.report_context,
    details?.report_context,
    valuationResult,
    valuationResultDetails,
    valuationResult?.report_context,
  ]

  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
    const obj = candidate as Record<string, unknown>
    return (
      obj.has_weighted_synthesis === true ||
      obj.blended_equity_value != null ||
      obj.synthesis_blended_value != null
    )
  })
}
