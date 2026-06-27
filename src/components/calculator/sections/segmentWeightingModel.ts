/**
 * segmentWeightingModel
 *
 * Pure helpers for the multi-business-type "Segment weighting" panel.
 *
 * A company that spans more than one business type (e.g. 50% auto-parts
 * retail + 50% accounting firm) is valued by blending the per-segment
 * benchmark multiples by weight:
 *
 *     enterprise_value ≈ total_EBITDA × Σ(weightᵢ × multipleᵢ)
 *
 * The weights are the only user-tunable lever in the simplified panel
 * (per-segment earnings was removed — see project memory). These helpers
 * keep the weights summing to exactly 100 and expose a derived "blended
 * multiple" readout so the advisor gets instant feedback on the blend.
 */

import type { BusinessTypeSegmentInput } from '../../../types/valuation'

export interface SegmentWeightRow {
  key: string
  title: string
  /** Raw basis token from the segment (e.g. "EBITDA"), if known. */
  basis?: string
  /** Display label for the multiple, e.g. "EV/EBITDA". Undefined when unknown. */
  multipleLabel?: string
  /** Effective multiple used for blended calculation (override if set, else benchmark). */
  multiple?: number
  /** Benchmark multiple from the engine (applied_multiple). Used as placeholder for override input. */
  benchmarkMultiple?: number
  /** Raw user override value — null when not set (reverts to benchmark). */
  overrideMultiple?: number | string | null
  /** Weight as an integer percentage 0–100. */
  weight: number
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Map a segment earnings basis to the canonical multiple label the market
 * uses for it. Kept in sync with the engine's basis vocabulary
 * ('SDE' | 'EBITDA' | 'EBIT' | 'Revenue').
 */
export function multipleLabelForBasis(basis: unknown): string | undefined {
  const token = String(basis ?? '')
    .trim()
    .toLowerCase()
  if (!token) return undefined
  if (token.includes('revenue') || token.includes('omzet')) return 'EV/Revenue'
  if (token.includes('ebitda')) return 'EV/EBITDA'
  if (token.includes('ebit')) return 'EV/EBIT'
  if (token.includes('sde')) return 'SDE'
  if (token.includes('arr')) return 'EV/ARR'
  return undefined
}

/**
 * Distribute 100% equally across `count` segments, pushing the rounding
 * remainder onto the leading segments so the array always sums to exactly
 * 100 (e.g. 3 segments → [34, 33, 33]).
 */
export function equalSegmentWeights(count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [100]
  const base = Math.floor(100 / count)
  let remainder = 100 - base * count
  return Array.from({ length: count }, () => base + (remainder-- > 0 ? 1 : 0))
}

/**
 * Resolve the display model for each segment. Weights are taken from the
 * stored segment when present; when every segment is missing a weight we
 * fall back to an equal split so the sliders start balanced at 100%.
 */
export function resolveSegmentWeightRows(
  segments: readonly BusinessTypeSegmentInput[]
): SegmentWeightRow[] {
  const stored = segments.map((segment) => finiteNumber(segment.weight))
  const anyStored = stored.some((weight) => weight != null)
  const fallback = equalSegmentWeights(segments.length)

  return segments.map((segment, index) => {
    const basis = segment.basis ?? segment.earnings_basis
    const benchmarkMultiple = finiteNumber(segment.applied_multiple)
    const overrideMultiple = segment.multiple ?? null
    const multiple = finiteNumber(segment.multiple) ?? benchmarkMultiple
    const storedWeight = stored[index]
    return {
      key: `${segment.business_type_id}-${index}`,
      title: segment.business_type_title ?? segment.business_type_id,
      basis: basis ?? undefined,
      multipleLabel: multipleLabelForBasis(basis),
      multiple,
      benchmarkMultiple,
      overrideMultiple,
      weight: anyStored ? Math.round(storedWeight ?? 0) : (fallback[index] ?? 0),
    }
  })
}

/**
 * Rebalance segment weights so they sum to exactly 100 after the user moves
 * one slider. The changed segment takes its new value; the remainder is
 * distributed across the other segments in proportion to their current
 * weights (mirroring the method-weight rebalance in methodFieldConfig). A
 * final rounding correction nudges the largest "other" so the total is
 * always exactly 100.
 */
export function rebalanceSegmentWeights(
  weights: readonly number[],
  changedIndex: number,
  nextValue: number
): number[] {
  const count = weights.length
  if (count === 0) return []
  if (count === 1) return [100]

  const clamped = Math.min(100, Math.max(0, Math.round(nextValue)))
  const result = new Array<number>(count)
  result[changedIndex] = clamped
  const remaining = 100 - clamped

  const otherIndexes = weights.map((_, i) => i).filter((i) => i !== changedIndex)
  const othersSum = otherIndexes.reduce((sum, i) => sum + weights[i], 0)

  if (othersSum <= 0) {
    // Others are all zero — distribute the remainder equally among them.
    const split = equalSegmentWeights(otherIndexes.length).map((w) =>
      Math.round((w / 100) * remaining)
    )
    otherIndexes.forEach((i, k) => {
      result[i] = split[k] ?? 0
    })
  } else {
    otherIndexes.forEach((i) => {
      result[i] = Math.round((weights[i] / othersSum) * remaining)
    })
  }

  // Correct any rounding drift by nudging the largest "other" segment.
  const sum = result.reduce((acc, w) => acc + w, 0)
  const diff = 100 - sum
  if (diff !== 0 && otherIndexes.length > 0) {
    let largest = otherIndexes[0]
    for (const i of otherIndexes) {
      if (result[i] > result[largest]) largest = i
    }
    result[largest] = Math.max(0, result[largest] + diff)
  }

  return result
}

/** Sum of the row weights (used to surface a "must total 100%" warning). */
export function totalSegmentWeight(rows: readonly SegmentWeightRow[]): number {
  return rows.reduce((sum, row) => sum + row.weight, 0)
}

/**
 * The weight-blended multiple: Σ(weightᵢ/100 × multipleᵢ). This is the
 * factor the engine applies to total EBITDA on the weighted-blend path, so
 * it is the most honest single-number readout of the blend. Returns
 * undefined unless every segment carries a finite multiple.
 */
export function blendedSegmentMultiple(rows: readonly SegmentWeightRow[]): number | undefined {
  if (rows.length === 0) return undefined
  let blended = 0
  for (const row of rows) {
    if (row.multiple == null) return undefined
    blended += (row.weight / 100) * row.multiple
  }
  return blended
}
