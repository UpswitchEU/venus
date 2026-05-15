import { resolveSynthesisPercentWeightsForMethods } from '@/constants/methodFieldConfig'

export interface SynthesisWeightSelection {
  preSelectedMethods: readonly string[]
  userWeights: Record<string, number>
  userWeightJustification?: string | null
}

export interface SynthesisWeightPayload {
  user_weights: Record<string, number>
  user_weight_justification?: string
}

const ADAPTIVE_METHOD_KEY = 'upswitch_adaptive'

/**
 * Converts the manual synthesis UI state into the Titan request contract.
 *
 * The UI stores integer percentages (0-100). Titan expects fractions (0-1).
 * This function is deliberately pure so submit/recalc paths do not have to
 * reach into Zustand while constructing a valuation request.
 */
export function buildSynthesisWeightPayload(
  selection: SynthesisWeightSelection
): SynthesisWeightPayload | null {
  const methods = [...selection.preSelectedMethods]
  if (methods.length < 2 || methods.includes(ADAPTIVE_METHOD_KEY)) return null

  const pct = resolveSynthesisPercentWeightsForMethods(methods, selection.userWeights)
  if (!pct) return null

  const user_weights: Record<string, number> = {}
  for (const [key, weightPct] of Object.entries(pct)) {
    user_weights[key] = weightPct / 100
  }

  const justification = selection.userWeightJustification?.trim()
  return {
    user_weights,
    ...(justification ? { user_weight_justification: justification } : {}),
  }
}
