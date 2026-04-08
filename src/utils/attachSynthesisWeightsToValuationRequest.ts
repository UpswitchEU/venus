/**
 * Waarderingssynthese → Titan → ValuationIQ: attach `user_weights` (fractions) when the manual
 * results store has 2+ non-adaptive methods. Used by ManualLayout and any other submit path
 * that calls `buildValuationRequest` + `calculateValuation`.
 */

import { resolveSynthesisPercentWeightsForMethods } from '../constants/methodFieldConfig'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'

export function attachSynthesisWeightsToValuationRequest(request: Record<string, unknown>): void {
  const snap = useManualResultsStore.getState()
  if (snap.preSelectedMethods.length < 2 || snap.preSelectedMethods.includes('upswitch_adaptive')) {
    return
  }
  const pct = resolveSynthesisPercentWeightsForMethods(snap.preSelectedMethods, snap.userWeights)
  if (!pct) return
  const normalized: Record<string, number> = {}
  for (const [k, v] of Object.entries(pct)) {
    normalized[k] = v / 100
  }
  request.user_weights = normalized
  if (snap.userWeightJustification?.trim()) {
    request.user_weight_justification = snap.userWeightJustification
  }
}
