import {
  buildSynthesisWeightPayload,
  type SynthesisWeightSelection,
} from '@/lib/synthesis/synthesisWeights'
import type { ValuationRequest } from '../types/valuation'

/**
 * Waarderingssynthese -> Titan -> ValuationIQ request adapter.
 *
 * Callers pass an explicit synthesis snapshot so request construction remains
 * deterministic even when submit/recalc logic runs across async boundaries.
 */
export function attachSynthesisWeightsToValuationRequest(
  request: ValuationRequest,
  selection: SynthesisWeightSelection
): void {
  const payload = buildSynthesisWeightPayload(selection)
  if (!payload) return
  request.user_weights = payload.user_weights
  if (payload.user_weight_justification) {
    request.user_weight_justification = payload.user_weight_justification
  }
}

export type { SynthesisWeightSelection }
