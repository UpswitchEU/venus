/**
 * Build Manual Valuation Request
 *
 * Decides between the SME `buildValuationRequest` and the venture
 * `buildStartupValuationRequest` based on the pre-selected method in
 * `useManualResultsStore`. Single submission entry point keeps the
 * three call sites in `ManualLayout` symmetric.
 *
 * @module utils/buildManualValuationRequest
 */

import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useStartupValuationStore } from '../store/manual/useStartupValuationStore'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import { buildStartupValuationRequest } from './buildStartupValuationRequest'
import { buildValuationRequest } from './buildValuationRequest'
import { resolveVentureCountryIso2 } from './resolveVentureCountryIso2'

export function buildManualValuationRequest(
  formData: ValuationFormData,
  overrideItems?: NormalizationItem[],
  locale?: 'nl' | 'en'
): ValuationRequest {
  const effectiveMethod =
    useManualResultsStore.getState().preSelectedMethod ??
    useManualResultsStore.getState().selectedMethod

  if (effectiveMethod === 'startup_valuation') {
    const resolvedCountry = resolveVentureCountryIso2(formData)
    const startupInputsBase = useStartupValuationStore.getState().toRequestPayload()
    const naceTrim = formData.nace_code?.trim() || formData.canonical_nace_code?.trim() || ''
    const startupInputs = {
      ...startupInputsBase,
      country_code: resolvedCountry,
      ...(naceTrim ? { nace_code: naceTrim } : {}),
    }
    return buildStartupValuationRequest({
      companyName: formData.company_name ?? 'Unknown Startup',
      countryCode: resolvedCountry,
      industry: formData.industry,
      businessModel: formData.business_model,
      foundingYear: formData.founding_year,
      naceCode: naceTrim || undefined,
      naceDescription: formData.nace_description,
      businessTypeId: formData.business_type_id,
      businessType: formData.business_type,
      startupInputs,
      locale,
    })
  }

  return buildValuationRequest(formData, overrideItems, locale)
}
