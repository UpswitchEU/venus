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

import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useStartupValuationStore } from '../store/manual/useStartupValuationStore'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { buildStartupValuationRequest } from './buildStartupValuationRequest'
import { buildValuationRequest } from './buildValuationRequest'

export function buildManualValuationRequest(
  formData: ValuationFormData,
  overrideItems?: NormalizationItem[],
  locale?: 'nl' | 'en'
): ValuationRequest {
  const effectiveMethod =
    useManualResultsStore.getState().preSelectedMethod ??
    useManualResultsStore.getState().selectedMethod

  if (effectiveMethod === 'startup_valuation') {
    const startupInputs = useStartupValuationStore.getState().toRequestPayload()
    return buildStartupValuationRequest({
      companyName: formData.company_name ?? 'Unknown Startup',
      countryCode:
        formData.country_code ??
        (formData as { country?: string }).country ??
        'BE',
      industry: formData.industry,
      businessModel: formData.business_model,
      foundingYear: formData.founding_year,
      naceCode: formData.nace_code,
      naceDescription: formData.nace_description,
      businessTypeId: formData.business_type_id,
      businessType: formData.business_type,
      startupInputs,
      locale,
    })
  }

  return buildValuationRequest(formData, overrideItems, locale)
}
