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

/**
 * Methods where the seller-keeps-real-estate carve-out is a meaningful input.
 *
 * The carve-out is a *going-concern equity bridge*: it subtracts fictive
 * market rent from EBITDA (so the buyer's earnings stream reflects the rent
 * the company would pay post-deal) and emits a balance-sheet adjustment row
 * that Step 7 applies to EV→Equity. Both effects only matter for methods
 * that consume EBITDA *or* run the EV→Equity bridge.
 *
 * Excluded — and the reasons they're excluded:
 *   - `omzet_multiple` / `arr_multiple` — value off revenue, not EBITDA.
 *     EBITDA rent adjustment is a no-op and there's no equity bridge.
 *   - `adjusted_nav` — has its own real-estate fair-value section
 *     (`NavRealEstateAppraisalSection`). The carve-out competes with it.
 *   - `fiscal_4x` — regulatory shortcut (4 × lopende rekening). EBITDA
 *     adjustments are conceptually meaningless.
 *   - `startup_valuation` — pre-revenue Berkus/Scorecard/VC. No EBITDA,
 *     no balance-sheet bridge.
 *   - `liquidation_analysis` — wind-down premise (IVS 104 §80). Real
 *     estate is its own realisation class; subtracting it from the
 *     balance-sheet would silently drop the building from the wind-down.
 */
export const REAL_ESTATE_CARVE_OUT_METHODS = [
  'ebitda_multiple',
  'dcf',
  'sde_multiple',
  'upswitch_adaptive',
] as const

export type RealEstateCarveOutMethod = (typeof REAL_ESTATE_CARVE_OUT_METHODS)[number]

const CARVE_OUT_METHOD_SET = new Set<string>(REAL_ESTATE_CARVE_OUT_METHODS)

/**
 * True when at least one of the selected methods consumes the carve-out.
 * Used to gate the UI: the section should only render when the toggle
 * would actually change a number on the report.
 */
export function realEstateCarveOutAppliesTo(
  selectedMethods: readonly string[] | undefined | null
): boolean {
  if (!selectedMethods || selectedMethods.length === 0) return false
  for (const m of selectedMethods) {
    if (CARVE_OUT_METHOD_SET.has(m)) return true
  }
  return false
}
