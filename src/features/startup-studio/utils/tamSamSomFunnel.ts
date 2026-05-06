/**
 * Pure helpers for TAM / SAM / SOM display on ExitStoryStep.
 * Percents are for UI only — not sent to the valuation engine.
 */

export type TamSamSomFunnelIssue = 'sam_gt_tam' | 'som_gt_sam' | 'som_gt_tam'

export interface SomSharePercents {
  /** 100 * SOM / SAM */
  pctOfSam: number
  /** 100 * SOM / TAM */
  pctOfTam: number
  /** Ordering / credibility flags — non-empty does not block showing percents */
  issues: TamSamSomFunnelIssue[]
}

/**
 * Returns null when inputs are not three positive finite numbers.
 */
export function computeSomSharePercents(
  tam: number,
  sam: number,
  som: number,
): SomSharePercents | null {
  if (
    !Number.isFinite(tam) ||
    !Number.isFinite(sam) ||
    !Number.isFinite(som) ||
    tam <= 0 ||
    sam <= 0 ||
    som <= 0
  ) {
    return null
  }

  const issues: TamSamSomFunnelIssue[] = []
  if (sam > tam) issues.push('sam_gt_tam')
  if (som > sam) issues.push('som_gt_sam')
  if (som > tam) issues.push('som_gt_tam')

  return {
    pctOfSam: (som / sam) * 100,
    pctOfTam: (som / tam) * 100,
    issues,
  }
}

export function formatSomShareForIntl(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

/** Upper bound (EUR) for studio metadata — avoids pathological payloads. */
export const TAM_SAM_SOM_MAX_EUR = 1e15

/**
 * Coerce a single funnel field for storage and API metadata:
 * non-finite / negative / zero → null; otherwise integer euros capped at
 * {@link TAM_SAM_SOM_MAX_EUR}.
 */
export function normalizeTamSamSomField(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded <= 0) return null
  return Math.min(rounded, TAM_SAM_SOM_MAX_EUR)
}

/**
 * One-field merge for session/API snapshots. Explicit `null` clears;
 * invalid or non-number incoming falls back to `previous` (normalized).
 */
export function mergeTamSamSomField(
  incoming: unknown,
  previous: number | null,
): number | null {
  if (incoming === null) return null
  if (typeof incoming === 'number' && Number.isFinite(incoming)) {
    return normalizeTamSamSomField(incoming)
  }
  return normalizeTamSamSomField(previous)
}
