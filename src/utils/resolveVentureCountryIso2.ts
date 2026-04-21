/**
 * ISO-3166 alpha-2 resolver for the venture valuation path.
 *
 * Mercury KBO prefill lands in `useManualFormStore`; the Studio wizard
 * writes `country_code` on `useStartupValuationStore`. Both the Titan
 * registry frame and `startup_inputs.country_code` must agree — see
 * `buildManualValuationRequest`.
 *
 * @module utils/resolveVentureCountryIso2
 */

import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import type { ValuationFormData } from '@/types/valuation'
import { coerceIso2OrNull } from './coerceIso2Country'

export { coerceIso2OrNull } from './coerceIso2Country'

/**
 * Prefer form / KBO identity, then legacy `country` string, then the
 * persisted Studio store, then Benelux default `BE`.
 */
export function resolveVentureCountryIso2(formData: ValuationFormData): string {
  return (
    coerceIso2OrNull(formData.country_code) ??
    coerceIso2OrNull((formData as { country?: string }).country) ??
    coerceIso2OrNull(useStartupValuationStore.getState().country_code) ??
    'BE'
  )
}
