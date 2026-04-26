'use client'

/**
 * useLiveValuation
 * ----------------
 *
 * Pure-frontend mirror of the Python engine's three-leg founder
 * triangulation (Berkus + SaaS Forward + VC Method).  Powers the
 * sticky right-hand "Live Valuation Receipt" so founders see the
 * range update on every keystroke without a Titan round-trip.
 *
 * The canonical numbers still come from the Python engine when the
 * founder hits "Generate report" — this hook is only for the live
 * preview during the wizard.
 *
 * Math is intentionally a 1:1 (rounded) shadow of:
 *   - apps/valuation-iq/src/domain/startup_valuation/berkus.py
 *   - apps/valuation-iq/src/domain/startup_valuation/vc_method.py
 *   - apps/valuation-iq/src/domain/startup_valuation/synthesis._FOUNDER_STAGE_WEIGHTS
 *
 * Anything more sophisticated (Scorecard regional anchoring, SaaS
 * forward ARR projection) is rendered with the same simple math the
 * existing legacy panel already uses.
 */

import { useMemo } from 'react'
import {
  STUDIO_BERKUS_KEYS,
  calculatePedigreeMultiplier,
  type StartupStage,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import type { StartupBenchmarkRow } from '@/lib/benchmarks/useStartupBenchmark'

export interface LiveLeg {
  /** Engine-side leg name. */
  key: 'berkus' | 'scorecard' | 'vc' | 'saas_forward'
  /** Translatable label key (resolved in the receipt component). */
  label: string
  /** Mid value EUR — null when the leg is unavailable. */
  value: number | null
  /** Range low/high EUR around the mid (±20% by default). */
  low: number | null
  high: number | null
  /** Founder-facing weight in the blend (0–1). */
  weight: number
  /** True when this leg was dropped (renormalised). */
  unavailable: boolean
}

export interface LiveValuation {
  /** Blended pre-money range EUR — *after* the founder pedigree overlay. */
  blended: { low: number; mid: number; high: number } | null
  /** Same blend without the pedigree multiplier — surfaced so the report
   *  preview can show "leg blend €X → with pedigree €Y" transparently. */
  blendedPrePedigree: { low: number; mid: number; high: number } | null
  /** Founder pedigree multiplier currently applied (1.0 = neutral). */
  pedigreeMultiplier: number
  legs: LiveLeg[]
  /** True until the founder has answered enough to compute anything. */
  isEmpty: boolean
}

const FOUNDER_WEIGHTS: Record<StartupStage, Record<LiveLeg['key'], number>> = {
  pre_seed: { berkus: 0.55, vc: 0.25, saas_forward: 0.2, scorecard: 0 },
  seed: { berkus: 0.25, vc: 0.4, saas_forward: 0.35, scorecard: 0 },
  series_a: { berkus: 0.1, vc: 0.5, saas_forward: 0.4, scorecard: 0 },
}

function safeRange(mid: number | null, spread = 0.2) {
  if (mid == null || !Number.isFinite(mid) || mid <= 0) return { low: null, high: null }
  return {
    low: Math.round(mid * (1 - spread)),
    high: Math.round(mid * (1 + spread)),
  }
}

function normaliseWeights(legs: LiveLeg[]) {
  const total = legs.reduce((sum, leg) => sum + (leg.unavailable ? 0 : leg.weight), 0)
  if (total <= 0) return legs.map((l) => ({ ...l, weight: 0 }))
  return legs.map((l) => (l.unavailable ? l : { ...l, weight: l.weight / total }))
}

export function useLiveValuation(benchmark: StartupBenchmarkRow): LiveValuation {
  const state = useStartupValuationStore()

  return useMemo(() => {
    // ── Berkus leg ────────────────────────────────────────────────
    const berkusMax = benchmark.berkus_max_per_milestone_eur
    const berkusValue = STUDIO_BERKUS_KEYS.reduce((sum, key) => {
      const score = (state[key] as number | undefined) ?? 0
      const clamped = Math.min(100, Math.max(0, score))
      return sum + (clamped / 100) * berkusMax
    }, 0)
    const hasAnyBerkusAnswer = STUDIO_BERKUS_KEYS.some((k) => state.maturity[k] !== 'none')

    // ── VC method leg ─────────────────────────────────────────────
    // pre = (year5 × exit_multiple ÷ target_roi) − round_size
    let vcValue: number | null = null
    if (
      state.year5_revenue_projection != null &&
      state.year5_revenue_projection > 0 &&
      state.exit_revenue_multiple != null &&
      state.exit_revenue_multiple > 0 &&
      state.target_roi_x != null &&
      state.target_roi_x > 0
    ) {
      const exit = state.year5_revenue_projection * state.exit_revenue_multiple
      const post = exit / state.target_roi_x
      const round = state.investment_amount_sought ?? 0
      vcValue = Math.max(0, post - round)
    }

    // ── SaaS forward leg ──────────────────────────────────────────
    // Conservative ARR × stage-default multiple (≈10× SaaS rule).
    let saasValue: number | null = null
    if (state.mrr != null && state.mrr > 0) {
      const arr = state.mrr * 12
      // 10× ARR is the SaaS forward rule the engine starts from.
      saasValue = arr * 10
    }

    const weights = FOUNDER_WEIGHTS[state.stage]

    const legs: LiveLeg[] = [
      {
        key: 'berkus',
        label: 'studio.legs.berkus',
        value: hasAnyBerkusAnswer ? Math.round(berkusValue) : null,
        ...safeRange(hasAnyBerkusAnswer ? berkusValue : null, 0.15),
        weight: weights.berkus,
        unavailable: !hasAnyBerkusAnswer,
      },
      {
        key: 'vc',
        label: 'studio.legs.vc',
        value: vcValue != null ? Math.round(vcValue) : null,
        ...safeRange(vcValue, 0.2),
        weight: weights.vc,
        unavailable: vcValue == null,
      },
      {
        key: 'saas_forward',
        label: 'studio.legs.saas',
        value: saasValue != null ? Math.round(saasValue) : null,
        ...safeRange(saasValue, 0.25),
        weight: weights.saas_forward,
        unavailable: saasValue == null,
      },
    ]

    const normalised = normaliseWeights(legs)
    const pedigreeMultiplier = calculatePedigreeMultiplier(state.founder_pedigree)
    const usable = normalised.filter((l) => !l.unavailable && l.value != null)
    if (usable.length === 0) {
      return {
        blended: null,
        blendedPrePedigree: null,
        pedigreeMultiplier,
        legs: normalised,
        isEmpty: true,
      }
    }
    const midPre = usable.reduce((sum, l) => sum + (l.value ?? 0) * l.weight, 0)
    const lowPre = Math.min(...usable.map((l) => l.low ?? 0))
    const highPre = Math.max(...usable.map((l) => l.high ?? 0))
    return {
      blended: {
        low: Math.round(lowPre * pedigreeMultiplier),
        mid: Math.round(midPre * pedigreeMultiplier),
        high: Math.round(highPre * pedigreeMultiplier),
      },
      blendedPrePedigree: {
        low: Math.round(lowPre),
        mid: Math.round(midPre),
        high: Math.round(highPre),
      },
      pedigreeMultiplier,
      legs: normalised,
      isEmpty: false,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.stage,
    state.maturity,
    state.sound_idea,
    state.prototype_status,
    state.management_strength,
    state.strategic_relationships,
    state.product_rollout,
    state.mrr,
    state.year5_revenue_projection,
    state.exit_revenue_multiple,
    state.target_roi_x,
    state.investment_amount_sought,
    state.founder_pedigree,
    benchmark.berkus_max_per_milestone_eur,
  ])
}

export function formatEur(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${Math.round(value)}`
}
