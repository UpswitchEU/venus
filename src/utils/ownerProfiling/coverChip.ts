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

import { toNumber } from '../decimal'
import type { ValuationResponse } from '../../types/valuation'

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

/**
 * 5-tier color band keyed off `risk_level`. Matches Aurora's chip palette
 * convention; the mapping intentionally collapses MEDIUM and LOW into the
 * same neutral band because the gap between them isn't perceptually
 * meaningful on a report cover.
 */
function colorBand(riskLevel: string): OwnerProfilingChipColorBand {
  switch (riskLevel) {
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

/**
 * Returns `null` when the response has no owner-profiling data — the cover
 * renders without a chip. Both `owner_dependency_result` AND
 * `owner_dependency_adjustment` must be present for a chip to be derived;
 * the legacy partial-population path (where only `_adjustment` was written)
 * is intentionally treated as "no chip" so we don't display a number with
 * no backing 12-factor breakdown to expand on hover.
 */
export function deriveOwnerProfilingChip(
  response: Pick<
    ValuationResponse,
    'owner_dependency_result' | 'owner_dependency_adjustment'
  >,
): OwnerProfilingChip | null {
  const result = response.owner_dependency_result
  if (!result) return null
  if (response.owner_dependency_adjustment === undefined) return null

  const applied = toNumber(response.owner_dependency_adjustment)
  if (!Number.isFinite(applied)) return null

  const riskLevel = result.risk_level
  const overallScore = result.overall_score
  if (typeof overallScore !== 'number') return null

  // Engine score 0-100 inverts to "transferability index" — see SPIKE-1 §2.2.
  // We round here (not in the engine) so the displayed integer is the same
  // across all surfaces (PDF, HTML, hover panel).
  const transferabilityRiskIndex = Math.round(100 - overallScore)
  const band = colorBand(riskLevel)

  // Cap is binding when the raw figure is more negative than the floor.
  // The `result.raw_adjustment` field was added in OP-4b; treat absence as
  // "synthesizer ran pre-OP-4 and we don't know" → render pass-through to
  // avoid lying about a cap that may not have been applied.
  const raw = result.raw_adjustment
  if (typeof raw === 'number' && raw < CAP_FLOOR - 1e-9) {
    return {
      mode: 'capped',
      transferabilityRiskIndex,
      riskLevel,
      appliedAdjustment: applied,
      rawAdjustment: raw,
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
