import type { ValuationMethodResult } from '../../../types/valuation'
import { getValuationMethodResultForKey } from '../../../utils/extractValuationResultsMap'

export function getSelectedBelgianAuditEntries({
  valuationResults,
  effectiveMethod,
  effectiveMethods,
}: {
  valuationResults?: Record<string, ValuationMethodResult> | null
  effectiveMethod: string
  effectiveMethods: string[]
}): Array<[string, ValuationMethodResult]> {
  if (!valuationResults) return []
  const methods = (effectiveMethods.length > 0 ? effectiveMethods : [effectiveMethod]).filter(
    Boolean
  )
  const seen = new WeakSet<ValuationMethodResult>()
  const out: Array<[string, ValuationMethodResult]> = []
  for (const key of methods) {
    const row = getValuationMethodResultForKey(valuationResults, key)
    if (!row?.details) continue
    if (seen.has(row)) continue
    seen.add(row)
    out.push([key, row])
  }
  return out
}
