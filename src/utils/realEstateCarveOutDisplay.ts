/**
 * Client display helper for real-estate carve-out — keeps Financiële historie / gewogen EBITDA
 * aligned with ValuationIQ `_apply_real_estate_carve_out` (subtract annual fictive rent per year).
 *
 * The legacy `REAL_ESTATE_CARVE_OUT_METHODS` hardcoded list is gone — the
 * source of truth is now `MethodSpec.appliesRealEstateCarveOut` on each
 * method's spec. See `selectionAppliesRealEstateCarveOut` in `@/lib/methods`.
 */

import { ORDERED_METHOD_SPECS, selectionAppliesRealEstateCarveOut } from '@/lib/methods'

export function getAnnualFictiveRentDeductionForDisplay(
  excludeRealEstate: boolean | undefined,
  estimatedMarketRent: number | undefined | null
): number {
  if (!excludeRealEstate) return 0
  if (estimatedMarketRent == null) return 0
  const r = Number(estimatedMarketRent)
  if (!Number.isFinite(r) || r <= 0) return 0
  return r
}

/**
 * Methods where the seller-keeps-real-estate carve-out is a meaningful input,
 * derived live from the method registry. The flag lives on each
 * `MethodSpec.appliesRealEstateCarveOut`. Adding/removing a method = one-line
 * spec edit; no separate hardcoded array to drift out of sync.
 *
 * Kept as `as const`-like readonly array for backwards compatibility with the
 * existing `RealEstateCarveOutMethod` type export.
 */
export const REAL_ESTATE_CARVE_OUT_METHODS: readonly string[] = ORDERED_METHOD_SPECS.filter(
  (spec) => spec.appliesRealEstateCarveOut
).map((spec) => spec.key)

export type RealEstateCarveOutMethod = string

/**
 * True when at least one of the selected methods consumes the carve-out.
 * Used to gate the UI: the section should only render when the toggle would
 * actually change a number on the report. Delegates to the registry-derived
 * `selectionAppliesRealEstateCarveOut` so the carve-out applicability is the
 * same set the engine sees server-side.
 */
export function realEstateCarveOutAppliesTo(
  selectedMethods: readonly string[] | undefined | null
): boolean {
  return selectionAppliesRealEstateCarveOut(selectedMethods)
}
