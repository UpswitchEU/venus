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

function normalizeWarningRows(raw: unknown): EngineDataQualityWarning[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (x): x is EngineDataQualityWarning => x != null && typeof x === 'object' && !Array.isArray(x)
  )
}

/**
 * Normalized read of `data_quality_warnings` from a valuation API payload.
 * Uses the first non-empty candidate list (preserves top-level over `details`, then nested `valuation_result` slots).
 */
export function getDataQualityWarningsFromResult(result: unknown): EngineDataQualityWarning[] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return []
  const root = result as Record<string, unknown>

  const candidates: unknown[] = [root['data_quality_warnings']]

  const details = root['details']
  if (details != null && typeof details === 'object' && !Array.isArray(details)) {
    const d = details as Record<string, unknown>
    candidates.push(d['data_quality_warnings'])
    const dvr = d['valuation_result']
    if (dvr != null && typeof dvr === 'object' && !Array.isArray(dvr)) {
      candidates.push((dvr as Record<string, unknown>)['data_quality_warnings'])
    }
  }

  const vr = root['valuation_result']
  if (vr != null && typeof vr === 'object' && !Array.isArray(vr)) {
    candidates.push((vr as Record<string, unknown>)['data_quality_warnings'])
  }

  for (const raw of candidates) {
    const rows = normalizeWarningRows(raw)
    if (rows.length > 0) return rows
  }
  return []
}
