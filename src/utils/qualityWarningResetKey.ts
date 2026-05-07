import { getDataQualityWarningsFromResult } from './dataQualityWarnings'
import { valuationResultRunKey } from './valuationResultRunKey'

function toUpdatedToken(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ''
  const rec = result as Record<string, unknown>
  const candidates = [rec['updated_at'], rec['updatedAt']]

  const details = rec['details']
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const d = details as Record<string, unknown>
    candidates.push(d['updated_at'], d['updatedAt'])
  }

  for (const candidate of candidates) {
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return String(candidate.getTime())
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate)
    }
  }
  return ''
}

/**
 * Snapshot key used to clear dismissed/acknowledged warning cards when a
 * materially new valuation result arrives (even if valuation_id is stable).
 */
export function buildQualityWarningResetKey(result: unknown): string {
  const runKey = valuationResultRunKey(result)
  const updated = toUpdatedToken(result)
  const highWarnings = getDataQualityWarningsFromResult(result)
    .filter((w) => String(w.severity ?? '').toLowerCase() === 'high')
    .map((w) => ({
      type: String(w.type ?? ''),
      message: String(w.message ?? ''),
      recommendation: String(w.recommendation ?? ''),
      step: String(w.step_number ?? ''),
    }))
    .filter((w) => w.type.length > 0)
    .sort((a, b) =>
      `${a.type}|${a.message}|${a.recommendation}|${a.step}`.localeCompare(
        `${b.type}|${b.message}|${b.recommendation}|${b.step}`
      )
    )

  const warningSig = highWarnings
    .map((w) => `${w.type}|${w.message}|${w.recommendation}|${w.step}`)
    .join('||')

  return `${runKey}::${updated}::${warningSig}`
}
