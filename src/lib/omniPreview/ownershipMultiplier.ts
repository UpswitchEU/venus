/**
 * Matches `comprehensive_valuation_orchestrator` omni ownership multiplier from `shares_for_sale`
 * (percentage of equity valued, 0–100). Step 8 refinements are not available client-side.
 */

export function ownershipMultiplierFromSharesForSale(
  sharesForSale: number | null | undefined
): number {
  if (sharesForSale == null || !Number.isFinite(sharesForSale)) {
    return 1
  }
  if (sharesForSale >= 100) {
    return 1
  }
  if (sharesForSale <= 0) {
    return 0
  }
  return sharesForSale / 100
}
