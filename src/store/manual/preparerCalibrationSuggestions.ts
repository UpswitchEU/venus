/**
 * Preparer calibration helpers — suggested-band map + dossier-signal detector.
 *
 * Why this file exists
 * --------------------
 * The EV/EBITDA calibration block in `ValuationEditModal` was shipping with a
 * dropdown of reason keys but zero guidance on the *magnitude* of adjustment a
 * given reason typically commands, and zero linkage to the data the engine had
 * already produced about this dossier. Two consequences:
 *
 *   1. M&A reviewers had to reach for Pratt / Damodaran offline to ground a
 *      number — defeating the purpose of an in-tool calibration.
 *   2. Owners with a clear signal (e.g. "owner is the company") got no nudge
 *      to apply a key-person discount.
 *
 * This module owns:
 *   - {@link SUGGESTED_DELTA_BAND} — the academic / market consensus band per
 *     reason (Pratt 2017 SDE multiples; Damodaran 2012 risk premia / discounts;
 *     Marktlink 2024 Belgian SME calibration).
 *   - {@link detectDossierSignal} — picks the strongest dossier-driven signal
 *     that is *not* already priced into the engine's `discount_waterfall`,
 *     and returns the reason key + suggested point delta + i18n metadata.
 *
 * Authoritative numbers below come from:
 *   • Pratt & Niculita (2008) — *Valuing a Business* §13 (control / lack-of)
 *   • Damodaran (2012) — *Investment Valuation* Ch.18 (relative valuation),
 *     Ch.24 (private firm adjustments)
 *   • Trugman (2017) — *Understanding Business Valuation* SME calibration
 *   • Marktlink + Vlerick (2024) — Belgian SME multiples handbook
 *
 * The point-delta returned is the **midpoint** of the typical band, not the
 * extreme — a starting point the preparer can tune. Bands are expressed in
 * **percent of benchmark multiple**, not absolute multiples, because the
 * absolute scale shifts with sector / region / size band.
 */

import type { PreparerEbitdaReasonKey } from './usePreparerMultipleStore'

export type SuggestedBandDirection = 'discount' | 'premium'

export interface SuggestedBand {
  /** Direction of the typical adjustment. */
  direction: SuggestedBandDirection
  /** Lower-bound % of benchmark (positive integer, e.g. 15 means 15% off / on). */
  lowPct: number
  /** Upper-bound % of benchmark. */
  highPct: number
  /** Suggested midpoint for one-click apply (positive integer). */
  midPct: number
}

/**
 * Reason → typical adjustment band map.
 *
 * Bands are intentionally conservative — the high end requires explicit
 * dossier evidence (an extreme strategic-buyer premium or a real distress
 * trigger). M&A reviewers should never be surprised by a "default" that
 * pushes outside p10/p90 of the peer set.
 */
export const SUGGESTED_DELTA_BAND: Record<PreparerEbitdaReasonKey, SuggestedBand | null> = {
  // Damodaran Ch.24 — strategic synergies for related-industry buyers run
  // 15–35% over the trading multiple; >35% is rare and usually indicates a
  // forced auction or a unique-asset target.
  strategic_buyer_premium: { direction: 'premium', lowPct: 15, highPct: 35, midPct: 25 },

  // Marktlink 2024 — exceptional management premium (audited succession plan,
  // top-quartile ROIC for ≥3y, no key-person dependency) lifts 5–15%.
  exceptional_management_premium: { direction: 'premium', lowPct: 5, highPct: 15, midPct: 10 },

  // Pratt 2017 — key-person discount for owner-operator SMEs sits at 20–35%
  // of the trading multiple. Below 20% the discount is rarely material; above
  // 35% the dossier is asking a buyer to buy a job, not a business.
  key_person_discount: { direction: 'discount', lowPct: 20, highPct: 35, midPct: 25 },

  // Real estate carve-out — when the asset stays in the deal, the multiple
  // should move down ~5–15% (since EBITDA isn't normalised for the rent
  // implicit in owning the building).
  real_estate_included: { direction: 'discount', lowPct: 5, highPct: 15, midPct: 10 },

  // Trugman 2017 — customer-concentration discount: top-1 client > 25% of
  // revenue → 10–25% multiple haircut, scaling with concentration.
  customer_concentration: { direction: 'discount', lowPct: 10, highPct: 25, midPct: 15 },

  // Pratt 2017 — distressed-sale discount: forced timeline, going-concern
  // doubts, or covenant breach → 25–45% off the orderly trading multiple.
  distressed_sale: { direction: 'discount', lowPct: 25, highPct: 45, midPct: 35 },

  // Damodaran Ch.18 — recurring-revenue premium for ≥60% recurring sales:
  // 10–25% over the lumpy-sales peer-set median.
  recurring_revenue_premium: { direction: 'premium', lowPct: 10, highPct: 25, midPct: 15 },

  // "Other" carries no academic anchor — the preparer must justify in note.
  other: null,
}

/**
 * Detect the strongest dossier signal that supports a calibration override.
 *
 * Selection rules:
 *   - We pick at most ONE signal (the strongest), to avoid drowning the UI in
 *     hints and to avoid stacking adjustments the user can't reason about.
 *   - We DO NOT suggest a discount when the engine has already applied an
 *     equivalent discount in `multiple_pipeline.discount_waterfall` — that
 *     would double-count.
 *   - We require both the signal AND the direction band to be present in
 *     {@link SUGGESTED_DELTA_BAND}.
 *
 * Returns null when no signal applies (which is the common case) — the UI
 * then renders the calibration block without a suggestion banner.
 */
export interface DossierSignal {
  reasonKey: PreparerEbitdaReasonKey
  band: SuggestedBand
  /** i18n key to render the human-readable signal description. */
  i18nKey: string
  /** Values to interpolate into the i18n key (e.g. `{percent}`). */
  i18nValues?: Record<string, string | number>
}

interface DetectInput {
  /** Recurring-revenue percentage — typically 0..1 from the response root. */
  recurringRevenuePercentage?: number | null
  /** Owner-concentration risk level reported by the engine (CRITICAL/HIGH/...). */
  ownerConcentrationRisk?: string | null
  /** Top-client concentration as a fraction of revenue (0..1) when available. */
  customerConcentrationPct?: number | null
  /**
   * Engine's already-applied discount waterfall. We use the raw step labels
   * to detect double-counting heuristically — if a step contains "owner",
   * "key person" or "concentration" and the discount magnitude is non-trivial,
   * we skip the corresponding signal.
   */
  appliedWaterfallStepNames?: ReadonlyArray<string>
}

const TRIVIAL_DISCOUNT_PCT = 1 // <1pt of multiple, ignore

function engineAlreadyDiscountsFor(
  matcher: RegExp,
  steps: ReadonlyArray<string> | undefined,
  appliedDiscountByStep?: ReadonlyArray<{ name: string; pct: number }>
): boolean {
  if (!steps || steps.length === 0) return false
  for (const name of steps) {
    if (!matcher.test(name)) continue
    if (!appliedDiscountByStep) return true
    const hit = appliedDiscountByStep.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (!hit || Math.abs(hit.pct) >= TRIVIAL_DISCOUNT_PCT) return true
  }
  return false
}

export function detectDossierSignal(input: DetectInput): DossierSignal | null {
  const ownerRisk = (input.ownerConcentrationRisk ?? '').toUpperCase()
  const ownerSteps = input.appliedWaterfallStepNames ?? []

  // Highest priority: critical owner-dependency, when the engine hasn't
  // already discounted for it in the pipeline.
  if (
    (ownerRisk === 'CRITICAL' || ownerRisk === 'HIGH') &&
    !engineAlreadyDiscountsFor(/owner|key.?person|concentratie|concentration/i, ownerSteps)
  ) {
    const band = SUGGESTED_DELTA_BAND.key_person_discount!
    return {
      reasonKey: 'key_person_discount',
      band,
      i18nKey: ownerRisk === 'CRITICAL' ? 'signalOwnerCritical' : 'signalOwnerHigh',
    }
  }

  // Second priority: customer concentration ≥ 25% of revenue when the engine
  // hasn't already applied it.
  const ccPct = input.customerConcentrationPct
  if (
    ccPct != null &&
    Number.isFinite(ccPct) &&
    ccPct >= 0.25 &&
    !engineAlreadyDiscountsFor(/customer|client|concentratie|concentration/i, ownerSteps)
  ) {
    const band = SUGGESTED_DELTA_BAND.customer_concentration!
    return {
      reasonKey: 'customer_concentration',
      band,
      i18nKey: 'signalCustomerConcentration',
      i18nValues: { percent: Math.round(ccPct * 100) },
    }
  }

  // Third priority: recurring-revenue premium when ≥60% of revenue is recurring
  // and the engine hasn't already applied a recurring-revenue bonus.
  const rrPct = input.recurringRevenuePercentage
  if (
    rrPct != null &&
    Number.isFinite(rrPct) &&
    rrPct >= 0.6 &&
    !engineAlreadyDiscountsFor(/recurring|terugkerend/i, ownerSteps)
  ) {
    const band = SUGGESTED_DELTA_BAND.recurring_revenue_premium!
    return {
      reasonKey: 'recurring_revenue_premium',
      band,
      i18nKey: 'signalRecurringRevenueHigh',
      i18nValues: { percent: Math.round(rrPct * 100) },
    }
  }

  return null
}

/**
 * Convert a band's midpoint into an absolute applied-multiple number.
 *
 * Returns the suggested multiple (rounded to 2dp) ready to be set on the
 * preparer store. Caller is responsible for clamping into the slider's
 * benchmark-relative bounds.
 */
export function projectSuggestedMultiple(benchmarkMultiple: number, band: SuggestedBand): number {
  const factor = band.direction === 'discount' ? 1 - band.midPct / 100 : 1 + band.midPct / 100
  return Math.round(benchmarkMultiple * factor * 100) / 100
}

// ──────────────────────────────────────────────────────────────────────────
// Scenario presets — one-click M&A scenarios.
//
// Why these four (not all eight reasons)?
// ----------------------------------------
// The reason picker carries the full PREPARER_EBITDA_REASON_KEYS set so the
// preparer can articulate any deal narrative. The presets are a *curated*
// subset: the four most common M&A "shapes" we see in audit work. The other
// four reasons (`exceptional_management_premium`, `real_estate_included`,
// `key_person_discount`, `other`) are still available via the picker — they
// just don't get a one-click chip because they're either dossier-specific
// (key-person — the auto-suggest already covers it) or require a written
// note (other / real-estate carve-out / management-team specifics).
//
// Each preset maps a reason key + an i18n label/hint to the canonical band
// midpoint from SUGGESTED_DELTA_BAND. The midpoint factor matches what the
// auto-suggest panel uses, so behaviour is identical between "engine
// suggested" and "preparer picked from chips". #}
export interface ScenarioPreset {
  /** Stable key for analytics / tests. */
  id: 'distressed' | 'strategic_buyer' | 'recurring_premium' | 'customer_concentration'
  /** Reason key written into the store on apply. */
  reasonKey: PreparerEbitdaReasonKey
  /** Pre-baked band midpoint (taken from SUGGESTED_DELTA_BAND). */
  band: SuggestedBand
  /** i18n label key under `preparerMultiple.*`. */
  labelI18nKey: string
  /** i18n hint key under `preparerMultiple.*`. */
  hintI18nKey: string
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'distressed',
    reasonKey: 'distressed_sale',
    band: SUGGESTED_DELTA_BAND.distressed_sale!,
    labelI18nKey: 'presetDistressed',
    hintI18nKey: 'presetDistressedHint',
  },
  {
    id: 'strategic_buyer',
    reasonKey: 'strategic_buyer_premium',
    band: SUGGESTED_DELTA_BAND.strategic_buyer_premium!,
    labelI18nKey: 'presetStrategicBuyer',
    hintI18nKey: 'presetStrategicBuyerHint',
  },
  {
    id: 'recurring_premium',
    reasonKey: 'recurring_revenue_premium',
    band: SUGGESTED_DELTA_BAND.recurring_revenue_premium!,
    labelI18nKey: 'presetRecurringPremium',
    hintI18nKey: 'presetRecurringPremiumHint',
  },
  {
    id: 'customer_concentration',
    reasonKey: 'customer_concentration',
    band: SUGGESTED_DELTA_BAND.customer_concentration!,
    labelI18nKey: 'presetCustomerConcentration',
    hintI18nKey: 'presetCustomerConcentrationHint',
  },
]
