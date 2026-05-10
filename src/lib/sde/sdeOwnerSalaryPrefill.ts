/**
 * SDE owner-salary prefill — derive a high-confidence default for the
 * `owner_salary_addback` input from the normalization store.
 *
 * Why
 * ---
 * When the user imports a Belgian/Dutch trial balance via Bizzcontrol /
 * Octopus / Yuki / Silverfin / Exact, account 620 (Bezoldigingen
 * bestuurders en zaakvoerders) carries the actual director compensation.
 * Titan's auto-normalization service surfaces it as a `category: 'salary'`
 * normalization item with `value` = the per-year amount and
 * `adjustment` = the delta vs market.
 *
 * For SDE the `owner_salary_addback` field wants the *gross* amount
 * (working owner: full salary so the engine can add back the delta vs
 * market; passive owner: full salary so the engine can add back the
 * whole thing). Until 2026-05-10 Venus left this field empty and the
 * engine fell back to `revenue × 15%` — fine as a last resort, wrong
 * when better data is sitting in the normalization store.
 *
 * This helper picks the latest historical year's salary item value as
 * the prefill, with provenance so the input can show a "Prefilled"
 * badge. Pure — no I/O, SSR-safe.
 */

export interface SdeSalaryPrefillNormalizationItem {
  category: string
  status: string
  value: number
  adjustment?: number
  year: number
  ledgerCode?: string
}

export type SdeSalaryPrefillSource = 'imported_ledger' | 'manual_entry' | null

export interface SdeSalaryPrefillResult {
  /** Suggested value for `owner_salary_addback`, or null when no
   *  defensible signal exists in the normalization store. */
  suggestedValue: number | null
  /** Year the suggestion was derived from (latest historical year with
   *  a non-zero salary item). */
  sourceYear: number | null
  /** Where the suggestion came from. `imported_ledger` is a real
   *  trial-balance number; `manual_entry` is a user-typed normalization
   *  the user already accepted. Both are higher confidence than the
   *  engine's revenue-based estimate. */
  source: SdeSalaryPrefillSource
}

const EMPTY: SdeSalaryPrefillResult = {
  suggestedValue: null,
  sourceYear: null,
  source: null,
}

/**
 * Returns a non-zero owner-salary suggestion when:
 *   - there's at least one accepted `category: 'salary'` normalization
 *     item with a positive `value`;
 *   - the latest historical year drives the suggestion (most recent
 *     full year wins);
 *   - the source is preserved so the UI can render a provenance badge.
 *
 * Returns `EMPTY` when nothing usable is in the store. The caller is
 * responsible for never overwriting a value the user has already typed.
 */
export function computeSdeOwnerSalaryPrefill(
  items: ReadonlyArray<SdeSalaryPrefillNormalizationItem> | null | undefined,
): SdeSalaryPrefillResult {
  if (!items || items.length === 0) return EMPTY

  let bestYear: number | null = null
  let bestValue: number | null = null
  let bestSource: SdeSalaryPrefillSource = null

  for (const item of items) {
    if (item.status !== 'accepted') continue
    if (item.category !== 'salary') continue
    const value = Number(item.value)
    if (!Number.isFinite(value) || value <= 0) continue
    const year = Number(item.year)
    if (!Number.isFinite(year)) continue

    if (bestYear === null || year > bestYear) {
      bestYear = year
      bestValue = value
      bestSource = isImportedLedgerLedgerCode(item.ledgerCode)
        ? 'imported_ledger'
        : 'manual_entry'
    }
  }

  if (bestValue === null || bestYear === null) return EMPTY

  return {
    suggestedValue: Math.round(bestValue),
    sourceYear: bestYear,
    source: bestSource,
  }
}

/** Belgian MAR account codes for owner-director compensation (account
 *  62 family). 620 (Bezoldigingen bestuurders en zaakvoerders) is the
 *  canonical anchor; 618 is used by Titan's auto-normalization service
 *  (Bestuurdersbezoldiging) and we accept both so any provider's
 *  mapping is recognised as imported-from-ledger. */
function isImportedLedgerLedgerCode(code: string | undefined | null): boolean {
  if (!code) return false
  const normalized = code.trim()
  return normalized === '620' || normalized === '618' || normalized.startsWith('620') || normalized.startsWith('618')
}
