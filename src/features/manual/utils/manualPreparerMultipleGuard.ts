import { clientShouldWarnExtremeMultiple } from '@/store/manual/usePreparerMultipleStore'

export interface ManualPreparerMultipleState {
  benchmarkMedian: number | null
  appliedMedian: number | null
  reasonKey?: string | null
  acknowledgedExtreme: boolean
}

export interface ManualPreparerMultipleBands {
  p10_ebitda_multiple?: number | null
  p25_ebitda_multiple?: number | null
  p75_ebitda_multiple?: number | null
  p90_ebitda_multiple?: number | null
}

/**
 * Shared guard for advisor-selected EBITDA multiple overrides.
 * Extreme overrides are allowed only after the advisor explicitly acknowledges
 * the warning; submit, recalculation, and modal auto-persist all use this.
 */
export function shouldBlockExtremePreparerMultiple(
  state: ManualPreparerMultipleState,
  bands: ManualPreparerMultipleBands | null | undefined
): boolean {
  if (state.acknowledgedExtreme) return false
  if (state.benchmarkMedian == null || state.appliedMedian == null) return false
  if (!state.reasonKey) return false
  if (Math.abs(state.appliedMedian - state.benchmarkMedian) < 0.005) return false

  return clientShouldWarnExtremeMultiple(
    state.appliedMedian,
    bands?.p10_ebitda_multiple,
    bands?.p90_ebitda_multiple,
    state.benchmarkMedian,
    bands?.p25_ebitda_multiple,
    bands?.p75_ebitda_multiple
  )
}
