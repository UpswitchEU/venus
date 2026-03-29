/**
 * Sum of NAV schedule adjustments entered in the manual panel (asset-based context).
 */

export type NavScheduleInputs = {
  navRealEstateAdjustment?: number
  navInventoryAdjustment?: number
  navHiddenReserves?: number
  navGoodwillWriteoff?: number
}

export function computeNavAdjustmentsSum(input: NavScheduleInputs): number {
  const keys: (keyof NavScheduleInputs)[] = [
    'navRealEstateAdjustment',
    'navInventoryAdjustment',
    'navHiddenReserves',
    'navGoodwillWriteoff',
  ]
  let sum = 0
  let any = false
  for (const k of keys) {
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
