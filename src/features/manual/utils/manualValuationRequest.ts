import type { NormalizationItem } from '@/components/calculator'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import type { ValuationFormData, ValuationRequest } from '@/types/valuation'
import { attachSynthesisWeightsToValuationRequest } from '@/utils/attachSynthesisWeightsToValuationRequest'
import { buildManualValuationRequest } from '@/utils/buildManualValuationRequest'

const ADAPTIVE_METHOD = 'upswitch_adaptive'

export interface ManualCalculationIdentifiers {
  reportId?: string
  sessionKey?: string
}

export type ManualCalculationRequest = ValuationRequest & {
  dataSource: 'manual'
  reportId?: string
  sessionKey?: string
}

export interface DecorateManualValuationRequestParams {
  selectedMethod?: string | null
  identifiers?: ManualCalculationIdentifiers
  synthesisSelection: SynthesisWeightSelection
}

export interface BuildManualCalculationRequestParams extends DecorateManualValuationRequestParams {
  formData: ValuationFormData
  normalizations?: NormalizationItem[]
  locale?: 'nl' | 'en' | 'fr'
}

/**
 * Applies the cross-cutting manual-flow request contract once:
 * source marker, selected method, synthesis weights, and report/session ids.
 */
export function decorateManualValuationRequest(
  request: ValuationRequest,
  params: DecorateManualValuationRequestParams
): ManualCalculationRequest {
  const out = request as ManualCalculationRequest
  out.dataSource = 'manual'

  const selectedMethod = params.selectedMethod?.trim()
  if (selectedMethod) {
    out.selected_method = selectedMethod
  }

  attachSynthesisWeightsToValuationRequest(out, params.synthesisSelection)
  if (out.user_weights && Object.keys(out.user_weights).length > 1) {
    out.selected_method = ADAPTIVE_METHOD
  }

  if (params.identifiers?.reportId) {
    out.reportId = params.identifiers.reportId
  }
  if (params.identifiers?.sessionKey) {
    out.sessionKey = params.identifiers.sessionKey
  }

  return out
}

/**
 * Builds and decorates a manual valuation request in one call so submit,
 * version-check, and recalculation paths cannot drift apart.
 */
export function buildManualCalculationRequest({
  formData,
  normalizations,
  locale,
  selectedMethod,
  identifiers,
  synthesisSelection,
}: BuildManualCalculationRequestParams): ManualCalculationRequest {
  return decorateManualValuationRequest(
    buildManualValuationRequest(formData, normalizations, locale),
    {
      selectedMethod,
      identifiers,
      synthesisSelection,
    }
  )
}
