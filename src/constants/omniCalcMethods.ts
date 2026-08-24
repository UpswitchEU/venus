import {
  DISTINCT_VALUATION_METHOD_COUNT as GENERATED_DISTINCT_VALUATION_METHOD_COUNT,
  VALUATION_PRIMARY_OMNI_METHOD_ORDER,
} from '@upswitch/types'

// Standalone builds resolve this generated contract from Venus's committed vendor package.

/**
 * Method keys shown in the primary list (before "Show all methods") in OmniCalc UI.
 * Order is stable for UX (headline → multiples → DCF → balance sheet → fiscal → downside).
 * Generated from ValuationIQ's canonical method registry.
 *
 * There are 10 primary keys here but **9 primary-list methodologies** because
 * `omzet_multiple` and `revenue_multiple` are the same turnover/revenue-multiple
 * approach (NL vs EN alias). The complete product surface has 10 distinct
 * methods: the registry also includes the standalone `startup_valuation` path.
 * `liquidation_analysis` is the downside lens (orderly + forced) and shares the
 * balance-sheet input contract with `adjusted_nav`.
 */
export const PRIMARY_OMNI_METHOD_ORDER = VALUATION_PRIMARY_OMNI_METHOD_ORDER

/** Use for pricing / marketing copy (distinct methodologies, not raw result keys). */
export const DISTINCT_VALUATION_METHOD_COUNT = GENERATED_DISTINCT_VALUATION_METHOD_COUNT

export const PRIMARY_OMNI_METHOD_KEYS = new Set<string>(PRIMARY_OMNI_METHOD_ORDER)

export function primaryOmniMethodOrderIndex(key: string): number {
  const i = (PRIMARY_OMNI_METHOD_ORDER as readonly string[]).indexOf(key)
  return i === -1 ? 999 : i
}

/** Primary methods first (catalog order), then secondary keys A–Z. */
export function compareOmniMethodKeys(a: string, b: string): number {
  const aP = PRIMARY_OMNI_METHOD_KEYS.has(a)
  const bP = PRIMARY_OMNI_METHOD_KEYS.has(b)
  if (aP && !bP) return -1
  if (!aP && bP) return 1
  if (aP && bP) return primaryOmniMethodOrderIndex(a) - primaryOmniMethodOrderIndex(b)
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function partitionOmniMethodEntries<T>(entries: [string, T][]): {
  primary: [string, T][]
  secondary: [string, T][]
} {
  const primary = entries
    .filter(([k]) => PRIMARY_OMNI_METHOD_KEYS.has(k))
    .sort(([a], [b]) => primaryOmniMethodOrderIndex(a) - primaryOmniMethodOrderIndex(b))
  const secondary = entries
    .filter(([k]) => !PRIMARY_OMNI_METHOD_KEYS.has(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return { primary, secondary }
}
