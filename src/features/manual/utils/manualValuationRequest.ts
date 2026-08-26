import type { NormalizationItem } from '@/components/calculator'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import type { ValuationFormData, ValuationRequest } from '@/types/valuation'
import { attachSynthesisWeightsToValuationRequest } from '@/utils/attachSynthesisWeightsToValuationRequest'
import { buildManualValuationRequest } from '@/utils/buildManualValuationRequest'

const ADAPTIVE_METHOD = 'upswitch_adaptive'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  accountantCustomerId?: string | null
  selectedMethod?: string | null
  identifiers?: ManualCalculationIdentifiers
  synthesisSelection: SynthesisWeightSelection
}

export interface BuildManualCalculationRequestParams extends DecorateManualValuationRequestParams {
  formData: ValuationFormData
  normalizations?: NormalizationItem[]
  locale?: 'nl' | 'en' | 'fr'
}

function normalizeAccountantCustomerId(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return undefined
  return UUID_PATTERN.test(trimmed) ? trimmed : undefined
}

function hasPositiveDcfWeight(weights?: Record<string, number>): boolean {
  return Object.entries(weights ?? {}).some(
    ([method, weight]) => method.toLowerCase().includes('dcf') && Number(weight) > 0
  )
}

function hasExplicitDcfIntent(request: ValuationRequest): boolean {
  return Boolean(
    request.selected_method === 'dcf' ||
      request.user_configured_dcf ||
      request.dcf_input_mode === 'fcff_only' ||
      hasPositiveDcfWeight(request.user_weights)
  )
}

/**
 * Applies the cross-cutting manual-flow request contract once:
 * source marker, selected method, synthesis weights, report/session ids,
 * and caller company context.
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

  // `use_dcf` is a capability flag, not durable user intent. Preserve it for
  // plain Adaptive so a ready DCF leg can participate; durable explicit intent
  // travels through selected method, weights, FCFF mode or user configuration.
  if (out.selected_method === ADAPTIVE_METHOD && hasExplicitDcfIntent(out)) {
    out.use_dcf = true
  }

  if (params.identifiers?.reportId) {
    out.reportId = params.identifiers.reportId
  }
  if (params.identifiers?.sessionKey) {
    out.sessionKey = params.identifiers.sessionKey
  }

  const accountantCustomerId = normalizeAccountantCustomerId(params.accountantCustomerId)
  if (accountantCustomerId) {
    out.metadata = {
      ...(out.metadata ?? {}),
      accountant_customer_id: accountantCustomerId,
    }
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
  accountantCustomerId,
  selectedMethod,
  identifiers,
  synthesisSelection,
}: BuildManualCalculationRequestParams): ManualCalculationRequest {
  return decorateManualValuationRequest(
    buildManualValuationRequest(formData, normalizations, locale),
    {
      accountantCustomerId,
      selectedMethod,
      identifiers,
      synthesisSelection,
    }
  )
}
