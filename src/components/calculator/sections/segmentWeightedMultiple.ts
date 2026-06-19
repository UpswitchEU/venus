/**
 * Segment-weighted multiple (true SOTP blend) — read-only derivation.
 *
 * BET-527 requires the live before/after preview to react when an advisor
 * changes per-segment SOTP weights. The segment-weighted multiple is a pure
 * function of values the advisor already entered (`business_type_segments`):
 * each segment's `applied_multiple` (or `multiple`) and its `weight`. It does
 * **not** call the valuation engine or open a second math path — it reads the
 * same form SSOT the request is built from and produces the weighted average
 * multiple the engine would blend, so the preview stays in lockstep with the
 * controls without a report re-run.
 */

import type { BusinessTypeSegmentInput } from '../../../types/valuation/request'

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function segmentMultiple(segment: BusinessTypeSegmentInput): number | null {
  const applied = toFiniteNumber(segment.applied_multiple)
  if (applied != null && applied > 0) return applied
  const fallback = toFiniteNumber(segment.multiple)
  return fallback != null && fallback > 0 ? fallback : null
}

/**
 * Weighted-average multiple across SOTP segments. Returns `null` unless at
 * least two segments carry a usable multiple (a single segment is just the
 * regular single-type valuation, already covered by the baseline preview).
 *
 * Weights are taken as provided and renormalised against the segments that
 * actually contribute a multiple, so a blank/zero weight on one leg degrades
 * gracefully instead of skewing the blend. When no weights are present the
 * function falls back to an equal-weight blend.
 */
export function computeSegmentWeightedMultiple(
  segments: BusinessTypeSegmentInput[] | undefined
): number | null {
  if (!Array.isArray(segments) || segments.length < 2) return null

  const usable = segments
    .map((segment) => ({
      multiple: segmentMultiple(segment),
      weight: toFiniteNumber(segment.weight),
    }))
    .filter((row): row is { multiple: number; weight: number | null } => row.multiple != null)

  if (usable.length < 2) return null

  const totalWeight = usable.reduce((sum, row) => sum + Math.max(0, row.weight ?? 0), 0)

  // No (or all-zero) weights → equal-weight blend.
  if (totalWeight <= 0) {
    const sum = usable.reduce((acc, row) => acc + row.multiple, 0)
    return sum / usable.length
  }

  const weighted = usable.reduce(
    (acc, row) => acc + row.multiple * (Math.max(0, row.weight ?? 0) / totalWeight),
    0
  )
  return Number.isFinite(weighted) && weighted > 0 ? weighted : null
}
