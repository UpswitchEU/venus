/**
 * Engine-emitted Pass-7 warnings (ValuationIQ → `data_quality_warnings` on valuation result payloads).
 */
export type EngineDataQualityWarning = {
  type?: string
  severity?: string
  message?: string
  recommendation?: string
  step_number?: number
}

/** Normalized read — always an array (empty when missing or malformed). */
export function getDataQualityWarningsFromResult(result: unknown): EngineDataQualityWarning[] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return []
  const w = (result as { data_quality_warnings?: unknown }).data_quality_warnings
  if (!Array.isArray(w)) return []
  return w as EngineDataQualityWarning[]
}
