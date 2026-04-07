/**
 * Sum of NAV schedule adjustments entered in the manual panel (asset-based context).
 */

export type NavScheduleInputs = {
  navRealEstateAdjustment?: number
  navInventoryAdjustment?: number
  navHiddenReserves?: number
  navGoodwillWriteoff?: number
  navReceivablesAdjustment?: number
  navOtherRevaluations?: number
}

/**
 * Deductions applied after gross adjustments: tax latency on unrealised gains
 * and off-balance-sheet contingent liabilities.
 */
export type NavDeductionInputs = {
  navTaxLatencyPct?: number
  navOffBalanceItems?: number
}

const NAV_SCHEDULE_KEYS: (keyof NavScheduleInputs)[] = [
  'navRealEstateAdjustment',
  'navInventoryAdjustment',
  'navHiddenReserves',
  'navGoodwillWriteoff',
  'navReceivablesAdjustment',
  'navOtherRevaluations',
]

export function computeNavAdjustmentsSum(input: NavScheduleInputs): number {
  let sum = 0
  let any = false
  for (const k of NAV_SCHEDULE_KEYS) {
    const v = input[k]
    if (v != null && Number.isFinite(v)) {
      sum += v
      any = true
    }
  }
  return any ? sum : 0
}

/** True if any NAV field was set (including explicit 0 — treated as user input). */
export function hasAnyNavAdjustment(input: NavScheduleInputs): boolean {
  return (
    computeNavAdjustmentsSum(input) !== 0 ||
    Object.values(input).some((v) => v != null && Number.isFinite(v))
  )
}

/** Count how many NAV adjustment fields have been filled (finite number including 0). */
export function countFilledNavFields(input: NavScheduleInputs): number {
  return NAV_SCHEDULE_KEYS.filter((k) => {
    const v = input[k]
    return v != null && Number.isFinite(v)
  }).length
}

export const NAV_TOTAL_FIELDS = NAV_SCHEDULE_KEYS.length

/** Belgian standard corporate tax rate applied to unrealised capital gains. */
export const NAV_DEFAULT_TAX_LATENCY_PCT = 25

/**
 * Sum of individually-positive adjustments eligible for tax latency.
 * Mirrors the backend `gross_positive_adjustments` in `asset_based_support.py`:
 * only real_estate, hidden_reserves, other_revaluations, inventory, and
 * receivables — goodwill is excluded (it reduces assets, never creates a gain).
 * Each value must be > 0 individually; negative corrections are ignored.
 */
export function computeGrossPositiveAdjustments(input: NavScheduleInputs): number {
  const taxableKeys: (keyof NavScheduleInputs)[] = [
    'navRealEstateAdjustment',
    'navHiddenReserves',
    'navOtherRevaluations',
    'navInventoryAdjustment',
    'navReceivablesAdjustment',
  ]
  let sum = 0
  for (const k of taxableKeys) {
    const v = input[k]
    if (v != null && Number.isFinite(v) && v > 0) {
      sum += v
    }
  }
  return sum
}

/**
 * Compute the tax latency deduction on positive gross adjustments.
 * Only positive adjustments (gains) are taxable; negative corrections are not.
 */
export function computeTaxLatencyDeduction(
  grossPositiveAdjustments: number,
  taxLatencyPct: number | undefined | null
): number {
  if (grossPositiveAdjustments <= 0) return 0
  const pct = taxLatencyPct != null && Number.isFinite(taxLatencyPct) ? taxLatencyPct : 0
  return -Math.abs(grossPositiveAdjustments * (pct / 100))
}

/**
 * Client-side estimated corrected NAV:
 *   Book equity + net adjustments - tax latency on positive gains - off-balance items
 * Returns null when balance-sheet data is missing.
 *
 * @param grossAdjustmentSum  NET sum of all adjustments (for the additive term)
 * @param grossPositiveAdjustments  Sum of individually-positive adjustments excl.
 *   goodwill (tax base — mirrors backend `gross_positive_adjustments`)
 */
export function computeEstimatedNav(
  totalAssets: number | undefined | null,
  totalLiabilities: number | undefined | null,
  grossAdjustmentSum: number,
  grossPositiveAdjustments: number,
  taxLatencyPct?: number | null,
  offBalanceItems?: number | null
): number | null {
  if (totalAssets == null || !Number.isFinite(totalAssets)) return null
  if (totalLiabilities == null || !Number.isFinite(totalLiabilities)) return null

  const bookEquity = totalAssets - totalLiabilities
  const taxDeduction = computeTaxLatencyDeduction(grossPositiveAdjustments, taxLatencyPct)
  const offBalance =
    offBalanceItems != null && Number.isFinite(offBalanceItems) ? offBalanceItems : 0

  return bookEquity + grossAdjustmentSum + taxDeduction - Math.abs(offBalance)
}

/**
 * Sector-aware defaults for "I don't know" — pre-fills zero for fields
 * that are typically irrelevant for the given sector, helping users
 * acknowledge them without guessing.
 */
export const NAV_SECTOR_DEFAULTS: Record<string, Partial<NavScheduleInputs>> = {
  technology: {
    navInventoryAdjustment: 0,
    navRealEstateAdjustment: 0,
    navReceivablesAdjustment: 0,
  },
  services: {
    navRealEstateAdjustment: 0,
    navInventoryAdjustment: 0,
  },
  retail: {
    navRealEstateAdjustment: 0,
  },
  manufacturing: {
    navOtherRevaluations: 0,
  },
  construction: {
    navOtherRevaluations: 0,
  },
}

/** Resolve a business type string to its NAV sector defaults key, if any. */
export function resolveNavSectorKey(businessType?: string | null): string | null {
  if (!businessType) return null
  const lower = businessType.trim().toLowerCase()
  for (const key of Object.keys(NAV_SECTOR_DEFAULTS)) {
    if (lower.includes(key) || key.includes(lower)) return key
  }
  return null
}
