/**
 * NAV (Adjusted Net Asset Value) — auto-prefill engine
 * =====================================================
 * Round-2 prefill: turn the manual NAV form into a "no-brainer" by
 * deriving every defensible value we already have access to from the
 * balance sheet + country profile, BEFORE the user is asked to type
 * anything. Goal: an M&A advisor pre-selecting NAV sees a fully-staged
 * floor-value workspace, not eight blank inputs.
 *
 * What we prefill (in priority order):
 *
 *   1. **`nav_tax_latency_pct`** ← country code
 *      • BE → 25% (standard CIT rate, Art. 215 WIB 92 default before
 *        SME-rate resolution; the engine still derives the SME 20%
 *        rate when the eligibility test passes — this just seeds the
 *        UI so the user has a concrete number).
 *      • NL → 25.8% (Dutch Vpb top rate 2024+).
 *      • Other / unknown → blank, prompt the user.
 *
 *   2. **`nav_real_estate_book_value`** ← `formData.real_estate_book_value`
 *      The same number the seller already entered for the EBITDA-multiple
 *      real-estate carve-out. Reusing it is a free win — same balance
 *      sheet, same accounting principle, two mental models (carve-out vs.
 *      revaluation swap).
 *
 *   3. **Reference book values** (NOT prefilled — surfaced as a "Book:
 *      €X" caption next to the corresponding adjustment input so the user
 *      sees the magnitude they're correcting):
 *      • `inventory` → `nav_inventory_adjustment` reference
 *      • `accounts_receivable` → `nav_receivables_adjustment` reference
 *      These are deltas from book to fair value, not the book itself, so
 *      auto-filling them would be wrong — but the user benefits from
 *      seeing the anchor.
 *
 * What we don't prefill (and why):
 *
 *   • `nav_hidden_reserves` — by definition not on the balance sheet
 *   • `nav_goodwill_writeoff` — requires an impairment judgement
 *   • `nav_other_revaluations` — open-ended catch-all
 *   • `nav_off_balance_items` — pure user input
 *   • `nav_real_estate_appraisal_value` — requires a third-party appraisal
 *   • `nav_equipment_revaluation` — needs original-cost + age, not on the
 *     summarised balance sheet
 *
 * Why we can't prefill more (round-6 audit finding):
 *   Today's data model carries summary totals only — `YearDataInput` has
 *   `total_assets`, `current_assets`, `cash`, `inventory`,
 *   `accounts_receivable`, etc., but NOT per-class detail like
 *   `land_and_buildings` (PCMN 22), `equipment` (PCMN 23-26), or
 *   `goodwill` (PCMN 21). The official-financials registry payload
 *   (`OfficialFinancialsYearPayload.rubricsUsed`) only carries the
 *   *names* of rubrics the engine consumed, not the per-rubric values.
 *   `_imported_ledger_analysis` exposes SDE flags + EV/equity bridge
 *   but no balance-sheet breakdown either.
 *
 *   To go further, Hermes needs to surface a `balance_sheet_classes`
 *   payload (record from PCMN code prefix → value), which Venus then
 *   reads in this helper. Plumbing on the FE is ready: the
 *   `NavBookReferenceSnapshot` type already accepts `goodwill`. Tracked
 *   as a separate enrichment item.
 *
 * Provenance: every prefilled field is tagged in the returned
 * `provenance` map so the UI can surface a "Prefilled from your balance
 * sheet" badge and the user knows what to trust vs. review.
 */

/** Default Belgian standard CIT rate (Art. 215 WIB 92). */
export const NAV_TAX_LATENCY_DEFAULT_BE_PCT = 25
/** Dutch corporate income tax top rate (Vpb 2024+). */
export const NAV_TAX_LATENCY_DEFAULT_NL_PCT = 25.8

export type NavPrefillProvenanceSource =
  | 'country_default' // tax-latency rate from country
  | 'real_estate_carveout' // reused from existing real_estate_book_value
  | 'balance_sheet' // direct read from yearlyFinancials
  | 'sector_default' // sector-typical bands (B5)

export type NavPrefillField = 'nav_tax_latency_pct' | 'nav_real_estate_book_value'

export interface NavPrefillProvenance {
  source: NavPrefillProvenanceSource
  /** Short i18n key suffix for the provenance caption. */
  captionKey: string
  /** Optional contextual fragment (year, country code, etc.) for caption interpolation. */
  context?: Record<string, string | number>
}

export type NavPrefillProvenanceMap = Partial<Record<NavPrefillField, NavPrefillProvenance>>

export interface NavPrefillSnapshot {
  /** New values keyed by canonical NAV form field. Only fields we could derive are present. */
  values: Partial<Record<NavPrefillField, number>>
  /** Provenance per derived field. Keys mirror `values`. */
  provenance: NavPrefillProvenanceMap
}

export interface NavPrefillInputs {
  /** ISO-2 country (or longer form — we only inspect the prefix). */
  countryCode?: string | null
  /** Real-estate carve-out value the user entered for the EBITDA flow. */
  realEstateCarveOutBookValue?: number | null
  /** Existing form values — never overwrite a value the user has already typed. */
  existing: {
    nav_tax_latency_pct?: number | null
    nav_real_estate_book_value?: number | null
  }
}

/**
 * Resolve the country-default tax latency rate for the NAV summary card.
 * Returns `null` when the country isn't recognised — the engine falls
 * back to the SME-rule resolution, but the UI prompts the user.
 */
export function resolveCountryTaxLatencyPct(countryCode?: string | null): number | null {
  if (!countryCode) return null
  const code = countryCode.trim().toUpperCase().slice(0, 2)
  if (code === 'BE') return NAV_TAX_LATENCY_DEFAULT_BE_PCT
  if (code === 'NL') return NAV_TAX_LATENCY_DEFAULT_NL_PCT
  return null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Compute the prefill snapshot. Pure: same inputs → same output, no I/O,
 * no side effects. Caller decides when (and whether) to apply.
 *
 * The function never overwrites a user-typed value — every assignment
 * checks `existing[field]` first. This keeps prefill safe to call on
 * every render of the NAV section without trampling the user's edits.
 */
export function computeNavPrefill(input: NavPrefillInputs): NavPrefillSnapshot {
  const values: NavPrefillSnapshot['values'] = {}
  const provenance: NavPrefillProvenanceMap = {}

  // ── 1. Tax latency from country ─────────────────────────────────────
  if (!isFiniteNumber(input.existing.nav_tax_latency_pct)) {
    const rate = resolveCountryTaxLatencyPct(input.countryCode)
    if (rate != null) {
      values.nav_tax_latency_pct = rate
      provenance.nav_tax_latency_pct = {
        source: 'country_default',
        captionKey: 'taxLatencyFromCountry',
        context: {
          country: (input.countryCode ?? '').trim().toUpperCase().slice(0, 2),
        },
      }
    }
  }

  // ── 2. Real-estate book value from carve-out ────────────────────────
  // The carve-out is the SAME accounting figure (BE-GAAP code 22 / NL
  // RJ 212): land & buildings book value. Reusing it removes one of the
  // most-asked questions on the schedule.
  if (
    !isFiniteNumber(input.existing.nav_real_estate_book_value) &&
    isFiniteNumber(input.realEstateCarveOutBookValue) &&
    input.realEstateCarveOutBookValue > 0
  ) {
    values.nav_real_estate_book_value = input.realEstateCarveOutBookValue
    provenance.nav_real_estate_book_value = {
      source: 'real_estate_carveout',
      captionKey: 'realEstateFromCarveOut',
    }
  }

  return { values, provenance }
}

/**
 * Reference book values shown next to schedule inputs so the user has a
 * concrete anchor before deciding on a delta. NOT prefilled into form
 * state — these stay read-only because the form fields are
 * *adjustments*, not the books themselves.
 *
 * Sourced from the latest complete yearly-financial row.
 */
export interface NavBookReferenceInputs {
  inventory?: number | null
  accountsReceivable?: number | null
  goodwill?: number | null
  totalAssets?: number | null
  totalLiabilities?: number | null
}

export interface NavBookReferenceSnapshot {
  inventory: number | null
  accountsReceivable: number | null
  goodwill: number | null
  bookEquity: number | null
}

export function computeNavBookReferences(input: NavBookReferenceInputs): NavBookReferenceSnapshot {
  const inventory = isFiniteNumber(input.inventory) ? input.inventory : null
  const accountsReceivable = isFiniteNumber(input.accountsReceivable)
    ? input.accountsReceivable
    : null
  const goodwill = isFiniteNumber(input.goodwill) ? input.goodwill : null
  const bookEquity =
    isFiniteNumber(input.totalAssets) && isFiniteNumber(input.totalLiabilities)
      ? input.totalAssets - input.totalLiabilities
      : null
  return { inventory, accountsReceivable, goodwill, bookEquity }
}
