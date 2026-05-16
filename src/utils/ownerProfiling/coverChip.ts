/**
 * Owner Profiling cover-chip derivation (OWNER-PROFILING-1 / OP-6).
 *
 * Derives the small chip rendered on the report cover page from the
 * `owner_dependency_result` and `owner_dependency_adjustment` fields on
 * the valuation response. Pure function — easy to unit test, easy to
 * forward to the PDF renderer without dragging the React tree along.
 *
 * Contract enforcement (SPIKE-1 §5.4 R8):
 * - The CAPPED figure is always the headline. The RAW figure is shown
 *   only when the cap was binding, and only with the "Capped — full risk
 *   -X%" framing. We absolutely must not silently surface the raw figure;
 *   the chip's `mode === 'capped'` discriminant is what the renderer keys
 *   off so a future templating refactor can't drop the framing.
 * - When the assessment is missing entirely, returns `null`. The cover
 *   then renders without the chip; the [OWNER PROFILE NOT COMPLETED]
 *   watermark comes from the defensibility banner channel (`engine_warnings`
 *   per `project_launch_ready_2026_04_29`), which is template-independent.
 */

import type { ValuationResponse } from '../../types/valuation'
import { toNumber } from '../decimal'

export type OwnerProfilingChipColorBand = 'good' | 'neutral' | 'caution' | 'warn'

export type OwnerProfilingChip =
  | {
      /** Cap was NOT binding — show the raw figure as-is, no framing. */
      mode: 'pass-through'
      transferabilityRiskIndex: number
      riskLevel: string
      /** Negative percentage applied to equity (e.g. -0.0125). */
      adjustment: number
      colorBand: OwnerProfilingChipColorBand
    }
  | {
      /** Cap WAS binding — show the capped headline + the raw with explicit framing. */
      mode: 'capped'
      transferabilityRiskIndex: number
      riskLevel: string
      /** The figure that scaled equity values (-0.15..0.00). */
      appliedAdjustment: number
      /** The engine's uncapped output — render with "Capped — full risk -X%". */
      rawAdjustment: number
      colorBand: OwnerProfilingChipColorBand
    }

const CAP_FLOOR = -0.15

function clampTransferabilityRiskIndex(overallDependencyScore: number): number {
  const bounded = Math.min(100, Math.max(0, overallDependencyScore))
  const tri = Math.round(100 - bounded)
  return Math.min(100, Math.max(0, tri))
}

function parseOverallScore(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * 5-tier color band keyed off `risk_level`. Matches Aurora's chip palette
 * convention; the mapping intentionally collapses MEDIUM and LOW into the
 * same neutral band because the gap between them isn't perceptually
 * meaningful on a report cover.
 */
function colorBand(riskLevel: string): OwnerProfilingChipColorBand {
  switch (riskLevel.trim().toUpperCase()) {
    case 'MINIMAL':
      return 'good'
    case 'LOW':
    case 'MEDIUM':
      return 'neutral'
    case 'HIGH':
      return 'caution'
    case 'CRITICAL':
      return 'warn'
    default:
      return 'neutral'
  }
}

function parseAdjustmentFactor(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Aligns FE with Python aggregator — never accept objects/arrays as labels/scores. */
function normalizeRiskLevel(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    return trimmed !== '' ? trimmed : null
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw)
  }
  return null
}

function isStructuredOwnerDependencyPayload(
  v: unknown
): v is NonNullable<ValuationResponse['owner_dependency_result']> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Returns `null` when the response has no owner-profiling data — the cover
 * renders without a chip. Both `owner_dependency_result` AND
 * `owner_dependency_adjustment` must be present for a chip to be derived;
 * the legacy partial-population path (where only `_adjustment` was written)
 * is intentionally treated as "no chip" so we don't display a number with
 * no backing 12-factor breakdown to expand on hover.
 */
export function deriveOwnerProfilingChip(
  response: Pick<ValuationResponse, 'owner_dependency_result' | 'owner_dependency_adjustment'>
): OwnerProfilingChip | null {
  const result = response.owner_dependency_result
  if (!isStructuredOwnerDependencyPayload(result)) return null
  if (
    response.owner_dependency_adjustment === undefined ||
    response.owner_dependency_adjustment === null
  ) {
    return null
  }

  const applied = toNumber(response.owner_dependency_adjustment)
  if (!Number.isFinite(applied)) return null

  const riskLevel = normalizeRiskLevel(result.risk_level)
  if (!riskLevel) return null

  const overallParsed = parseOverallScore(result.overall_score)
  if (overallParsed === null) return null

  // Engine score 0-100 inverts to "transferability index" — see SPIKE-1 §2.2.
  // We round here (not in the engine) so the displayed integer is the same
  // across all surfaces (PDF, HTML, hover panel).
  const transferabilityRiskIndex = clampTransferabilityRiskIndex(overallParsed)
  const band = colorBand(riskLevel)

  // Cap is binding when the raw figure is more negative than the floor.
  // The `result.raw_adjustment` field was added in OP-4b; treat absence as
  // "synthesizer ran pre-OP-4 and we don't know" → render pass-through to
  // avoid lying about a cap that may not have been applied.
  const rawParsed = parseAdjustmentFactor(result.raw_adjustment)

  if (rawParsed !== null && rawParsed < CAP_FLOOR - 1e-9) {
    return {
      mode: 'capped',
      transferabilityRiskIndex,
      riskLevel,
      appliedAdjustment: applied,
      rawAdjustment: rawParsed,
      colorBand: band,
    }
  }

  return {
    mode: 'pass-through',
    transferabilityRiskIndex,
    riskLevel,
    adjustment: applied,
    colorBand: band,
  }
}

function hasCompleteOwnerProfilingPair(
  slice:
    | Pick<ValuationResponse, 'owner_dependency_result' | 'owner_dependency_adjustment'>
    | null
    | undefined
): boolean {
  return (
    isStructuredOwnerDependencyPayload(slice?.owner_dependency_result) &&
    slice.owner_dependency_adjustment !== undefined &&
    slice.owner_dependency_adjustment !== null
  )
}

/**
 * Owner-profiling state for the report cover band: chip OR skipped watermark
 * OR null (pre-flight, no result yet).
 *
 * The skipped-watermark surface fires when:
 *   - the response is real (has a `valuation_id`), AND
 *   - the wizard hasn't been completed (no `owner_dependency_result`).
 *
 * Pre-flight responses (no `valuation_id`) intentionally render nothing —
 * the wizard CTA on a not-yet-saved valuation would be confusing.
 */
export type OwnerProfilingState = { mode: 'chip'; chip: OwnerProfilingChip } | { mode: 'skipped' }

function hasValuationIdentity(slice: { valuation_id?: unknown } | null | undefined): boolean {
  if (!slice) return false
  const id = slice.valuation_id
  return typeof id === 'string' && id.trim() !== ''
}

export function deriveOwnerProfilingState(
  session:
    | (Pick<ValuationResponse, 'owner_dependency_result' | 'owner_dependency_adjustment'> & {
        valuation_id?: string
      })
    | null
    | undefined,
  result:
    | (Pick<ValuationResponse, 'owner_dependency_result' | 'owner_dependency_adjustment'> & {
        valuation_id?: string
      })
    | null
    | undefined
): OwnerProfilingState | null {
  const chip = deriveOwnerProfilingChipPreferSessionThenResult(session, result)
  if (chip) return { mode: 'chip', chip }
  // No chip — was the response real? If yes, surface the skipped watermark.
  if (hasValuationIdentity(session) || hasValuationIdentity(result)) {
    return { mode: 'skipped' }
  }
  return null
}

/**
 * Prefer a **complete** owner-profiling tuple from session, then from `result`.
 *
 * Important: never mix `owner_dependency_result` from one payload with
 * `owner_dependency_adjustment` from another — that pairing is undefined and
 * can surface phantom chips after partial hydration or optimistic updates.
 */
export function deriveOwnerProfilingChipPreferSessionThenResult(
  session:
    | Pick<ValuationResponse, 'owner_dependency_result' | 'owner_dependency_adjustment'>
    | null
    | undefined,
  result:
    | Pick<ValuationResponse, 'owner_dependency_result' | 'owner_dependency_adjustment'>
    | null
    | undefined
): OwnerProfilingChip | null {
  if (hasCompleteOwnerProfilingPair(session)) {
    const fromSession = deriveOwnerProfilingChip(session!)
    if (fromSession) return fromSession
  }
  if (hasCompleteOwnerProfilingPair(result)) {
    const fromResult = deriveOwnerProfilingChip(result!)
    if (fromResult) return fromResult
  }
  return null
}
