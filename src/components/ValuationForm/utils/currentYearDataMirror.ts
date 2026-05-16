import type { YearDataInput } from '../../../types/valuation'

/**
 * Applies top-level `revenue` / `ebitda` edits onto `current_year_data` using
 * the same clear semantics as the filing-year row mirror: `undefined` removes
 * the nested key so `buildValuationRequest` fallbacks cannot resurrect stale
 * figures.
 *
 * Only keys present on `keys` (own property) are applied — omit a field when it
 * did not change.
 */
export function patchCurrentYearDataFromTopLevelFinancials(
  cyd: YearDataInput | undefined | null,
  keys: Partial<{ revenue: number | undefined; ebitda: number | undefined }>
): YearDataInput | null {
  if (!cyd) return null
  const next: Record<string, unknown> = { ...cyd }

  if (Object.hasOwn(keys, 'revenue')) {
    if (keys.revenue === undefined) {
      delete next.revenue
    } else {
      next.revenue = keys.revenue
    }
  }
  if (Object.hasOwn(keys, 'ebitda')) {
    if (keys.ebitda === undefined) {
      delete next.ebitda
    } else {
      next.ebitda = keys.ebitda
    }
  }

  return next as unknown as YearDataInput
}
