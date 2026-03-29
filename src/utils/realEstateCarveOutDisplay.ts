/**
 * Client display helper for real-estate carve-out — keeps Financiële historie / gewogen EBITDA
 * aligned with ValuationIQ `_apply_real_estate_carve_out` (subtract annual fictive rent per year).
 */

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
