/**
 * SynthesisEngine — pure evaluation of the multi-method client-side blend.
 *
 * Replaces two near-identical copies of the same logic that lived inline in
 * `features/manual/components/ManualValuationWorkspace.tsx` (the `navValuationSummary`
 * memo and the "blend skipped" toast effect).
 *
 * The function is pure: no React, no side effects, no toasts. Callers decide
 * what to display or warn about based on the discriminated outcome.
 */

import { resolveSynthesisPercentWeightsForMethods } from '@/constants/methodFieldConfig'
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import {
  getValuationMethodResultForKey,
  hydrateClientValuationResultsMap,
  normalizeSelectedMethodKey,
} from '@/utils/extractValuationResultsMap'

const ADAPTIVE_METHOD_KEY = 'upswitch_adaptive'
const SYNTHESIS_MULTIPLES_METHOD_KEYS = new Set([
  'multiples',
  'ebitda_multiple',
  'ev_ebitda',
  'sde_multiple',
  'omzet_multiple',
  'revenue_multiple',
])

export interface SynthesisEngineInput {
  result: ValuationResponse | null | undefined
  preSelectedMethods: readonly string[]
  userWeights: Record<string, number>
}

export type ClientBlendStatus =
  | { kind: 'not-multi-method' }
  | { kind: 'no-weights' }
  | { kind: 'no-hydrated-results' }
  | {
      kind: 'blocked'
      blockerMethod: string
      blockerReason: string | null
      weightsByMethod: Record<string, number>
    }
  | { kind: 'invalid-sum'; weightsByMethod: Record<string, number> }
  | { kind: 'blended'; value: number; weightsByMethod: Record<string, number> }

export interface SynthesisEvaluation {
  client: ClientBlendStatus
  serverBlended: number | null
}

export function evaluateSynthesisBlend(input: SynthesisEngineInput): SynthesisEvaluation {
  const { result, preSelectedMethods, userWeights } = input
  const serverBlended = readServerBlend(result)

  if (preSelectedMethods.length < 2 || preSelectedMethods.includes(ADAPTIVE_METHOD_KEY)) {
    return { client: { kind: 'not-multi-method' }, serverBlended }
  }

  const blendPct = resolveSynthesisPercentWeightsForMethods(
    preSelectedMethods as string[],
    userWeights
  )
  if (!blendPct || Object.keys(blendPct).length < 2) {
    return { client: { kind: 'no-weights' }, serverBlended }
  }

  const hydrated = hydrateSynthesisValuationResultsMap(result ?? null)
  if (!hydrated || Object.keys(hydrated).length === 0) {
    return { client: { kind: 'no-hydrated-results' }, serverBlended }
  }

  let sum = 0
  for (const method of preSelectedMethods) {
    const pct = blendPct[method] ?? 0
    if (pct <= 0) continue
    const row = getValuationMethodResultForKey(
      hydrated as Record<string, ValuationMethodResult>,
      method
    )
    const rawVal = row?.value
    const n = rawVal == null ? NaN : Number(rawVal)
    if (!row?.available || !Number.isFinite(n)) {
      const rawReason = row?.unavailable_reason ?? null
      const blockerReason =
        typeof rawReason === 'string' && rawReason.trim().length > 0 ? rawReason : null
      return {
        client: {
          kind: 'blocked',
          blockerMethod: method,
          blockerReason,
          weightsByMethod: blendPct,
        },
        serverBlended,
      }
    }
    sum += n * (pct / 100)
  }

  if (!(sum > 0) || !Number.isFinite(sum)) {
    return {
      client: { kind: 'invalid-sum', weightsByMethod: blendPct },
      serverBlended,
    }
  }

  return {
    client: { kind: 'blended', value: Math.round(sum), weightsByMethod: blendPct },
    serverBlended,
  }
}

/**
 * Display priority: live client blend (reflects current weights) wins over the
 * server-persisted blend (which may have been computed with previous weights).
 */
export function bestBlendedValue(ev: SynthesisEvaluation): number | null {
  if (ev.client.kind === 'blended') return ev.client.value
  return ev.serverBlended
}

/**
 * True iff the client cannot blend (at least one positive-weight method is
 * unavailable or non-finite) AND the server did not provide a blend either.
 * If the server already has a value we trust it and suppress the warning.
 */
export function shouldWarnSynthesisSkipped(ev: SynthesisEvaluation): boolean {
  if (ev.serverBlended != null) return false
  return ev.client.kind === 'blocked'
}

export function hydrateSynthesisValuationResultsMap(
  result: ValuationResponse | null | undefined
): Record<string, ValuationMethodResult> | null {
  const hydrated = hydrateClientValuationResultsMap(result ?? null)
  if (!hydrated || Object.keys(hydrated).length === 0) return hydrated

  let changed = false
  const mapped: Record<string, ValuationMethodResult> = {}
  for (const [methodKey, row] of Object.entries(hydrated)) {
    const canonicalValue = canonicalSynthesisMethodValue(result, methodKey, row)
    if (canonicalValue != null && canonicalValue !== row.value) {
      changed = true
      mapped[methodKey] = { ...row, value: canonicalValue }
    } else {
      mapped[methodKey] = row
    }
  }
  return changed ? mapped : hydrated
}

export function canonicalSynthesisMethodValue(
  result: ValuationResponse | null | undefined,
  methodKey: string,
  row: ValuationMethodResult | undefined
): number | null {
  if (!isSynthesisMultiplesMethodKey(methodKey)) {
    return toFiniteNumber(row?.value)
  }

  const current = toFiniteNumber(row?.value)
  const netMultiplesEquity = readCanonicalMultiplesEquityValue(result)
  if (netMultiplesEquity == null) return current
  if (current == null) return netMultiplesEquity

  const materiality = Math.max(1, Math.abs(current) * 0.01)
  return Math.abs(current - netMultiplesEquity) > materiality ? netMultiplesEquity : current
}

function readServerBlend(result: ValuationResponse | null | undefined): number | null {
  const wv = result?.weighted_valuation?.blended_equity_value
  if (wv == null) return null
  const n = Number(wv)
  return Number.isFinite(n) ? n : null
}

function isSynthesisMultiplesMethodKey(methodKey: string): boolean {
  return SYNTHESIS_MULTIPLES_METHOD_KEYS.has(normalizeSelectedMethodKey(methodKey))
}

function readCanonicalMultiplesEquityValue(
  result: ValuationResponse | null | undefined
): number | null {
  return (
    toFiniteNumber(result?.multiples_valuation?.adjusted_equity_value) ??
    toFiniteNumber(result?.multiples_valuation?.enterprise_value)
  )
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}
