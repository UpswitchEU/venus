import { create } from 'zustand'

/** Mirrors Titan / Mercury preparer_ev_ebitda_override.reason_key */
export const PREPARER_EBITDA_REASON_KEYS = [
  'strategic_buyer_premium',
  'exceptional_management_premium',
  'key_person_discount',
  'real_estate_included',
  'customer_concentration',
  'distressed_sale',
  'recurring_revenue_premium',
  'other',
] as const

export type PreparerEbitdaReasonKey = (typeof PREPARER_EBITDA_REASON_KEYS)[number]

interface PreparerMultipleState {
  benchmarkMedian: number | null
  appliedMedian: number | null
  reasonKey: PreparerEbitdaReasonKey | ''
  note: string
  acknowledgedExtreme: boolean
  /** Sync from valuation result: prefer unadjusted as Upswitch benchmark */
  syncFromValuationResult: (result: {
    multiples_valuation?: {
      ebitda_multiple?: number
      unadjusted_ebitda_multiple?: number
      p10_ebitda_multiple?: number
      p25_ebitda_multiple?: number
      p75_ebitda_multiple?: number
      p90_ebitda_multiple?: number
    } | null
  } | null) => void
  setAppliedMedian: (v: number | null) => void
  setReasonKey: (v: PreparerEbitdaReasonKey | '') => void
  setNote: (v: string) => void
  setAcknowledgedExtreme: (v: boolean) => void
  resetToBenchmark: () => void
}

export const usePreparerMultipleStore = create<PreparerMultipleState>((set, get) => ({
  benchmarkMedian: null,
  appliedMedian: null,
  reasonKey: '',
  note: '',
  acknowledgedExtreme: false,

  syncFromValuationResult: (result) => {
    const mv = result?.multiples_valuation
    if (!mv) return
    const bench =
      mv.unadjusted_ebitda_multiple != null && Number.isFinite(Number(mv.unadjusted_ebitda_multiple))
        ? Number(mv.unadjusted_ebitda_multiple)
        : mv.ebitda_multiple != null && Number.isFinite(Number(mv.ebitda_multiple))
          ? Number(mv.ebitda_multiple)
          : null
    if (bench == null) return
    const applied =
      mv.ebitda_multiple != null && Number.isFinite(Number(mv.ebitda_multiple))
        ? Number(mv.ebitda_multiple)
        : bench
    set({
      benchmarkMedian: bench,
      appliedMedian: applied,
      reasonKey: '',
      note: '',
      acknowledgedExtreme: false,
    })
  },

  setAppliedMedian: (v) => set({ appliedMedian: v }),
  setReasonKey: (v) => set({ reasonKey: v }),
  setNote: (v) => set({ note: v }),
  setAcknowledgedExtreme: (v) => set({ acknowledgedExtreme: v }),

  resetToBenchmark: () => {
    const b = get().benchmarkMedian
    set({
      appliedMedian: b,
      reasonKey: '',
      note: '',
      acknowledgedExtreme: false,
    })
  },
}))

/**
 * Client-side guardrail aligned with Titan `isExtremePreparerMultiple`:
 * compare to p90/p10 when available; else fall back to p75/p25; else baseline ratios.
 */
export function clientShouldWarnExtremeMultiple(
  applied: number,
  p10?: number | null,
  p90?: number | null,
  baseline?: number | null,
  p25?: number | null,
  p75?: number | null,
): boolean {
  const hi = p90 != null && p90 > 0 ? p90 : p75
  const lo = p10 != null && p10 > 0 ? p10 : p25
  if (hi != null && hi > 0 && applied > hi * 1.25) return true
  if (lo != null && lo > 0 && applied < lo * 0.75) return true
  if (
    (lo == null || lo <= 0) &&
    (hi == null || hi <= 0) &&
    baseline != null &&
    baseline > 0
  ) {
    if (applied > baseline * 2.5) return true
    if (applied < baseline * 0.4) return true
  }
  return false
}

export function mergePreparerMultipleIntoRequest(request: Record<string, unknown>): void {
  const st = usePreparerMultipleStore.getState()
  const { benchmarkMedian, appliedMedian, reasonKey, note, acknowledgedExtreme } = st
  if (benchmarkMedian == null || appliedMedian == null || appliedMedian <= 0) return
  if (Math.abs(appliedMedian - benchmarkMedian) < 0.005) return
  if (!reasonKey) return
  request.preparer_ev_ebitda_median = Math.round(appliedMedian * 1000) / 1000
  request.preparer_ev_ebitda_override = {
    reason_key: reasonKey,
    ...(note?.trim() ? { note: note.trim().slice(0, 500) } : {}),
    ...(acknowledgedExtreme ? { acknowledged_extreme: true } : {}),
  }
}
