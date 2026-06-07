/**
 * BET-299 — "Review & Discuss" pre-lock step: pure agenda + gate logic.
 *
 * Assembles a structured review agenda from signals that ALREADY exist in the
 * wizard (engine defensibility/quality warnings, the synthesis method mix,
 * accepted normalizations, owner-profiling cap breaches). It does NOT call an
 * LLM and does NOT recompute anything — the wizard maps its existing state onto
 * the narrow `ReviewAgendaInputs` contract and renders `ReviewAgenda`.
 *
 * Persistence reuses `valuation_reports.metadata.discussion_phase` (no new
 * table/columns). React-free → unit-tested without the wizard or a DB.
 */

export type ReviewItemKind = 'quality_warning' | 'method_mix' | 'normalization' | 'cap_breach'

export type ReviewSeverity = 'high' | 'medium' | 'info'

export interface ReviewAgendaItem {
  kind: ReviewItemKind
  count: number
  severity: ReviewSeverity
  /** Stable refs (warning types / method keys) the UI can expand. */
  refs?: string[]
}

export interface ReviewAgenda {
  items: ReviewAgendaItem[]
  /**
   * Item kinds the advisor MUST acknowledge before the report can lock
   * (the high-severity ones). Informational items (method mix, normalizations)
   * are shown but don't gate.
   */
  acknowledgementKeys: ReviewItemKind[]
  /** True when the step gates the lock (there is something to acknowledge). */
  requiresReview: boolean
}

export interface ReviewAgendaInputs {
  qualityWarnings?: Array<{ type?: string; severity?: string }>
  methodWeights?: Record<string, number> | null
  acceptedNormalizationCount?: number
  capBreachCount?: number
}

const SEVERITY_RANK: Record<ReviewSeverity, number> = {
  info: 0,
  medium: 1,
  high: 2,
}

function normalizeSeverity(raw: string | undefined): ReviewSeverity {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === 'high' || s === 'critical' || s === 'block') return 'high'
  if (s === 'medium' || s === 'warn' || s === 'warning') return 'medium'
  return 'info'
}

function worstWarningSeverity(warnings: Array<{ severity?: string }>): ReviewSeverity {
  return warnings.reduce<ReviewSeverity>((worst, w) => {
    const sev = normalizeSeverity(w.severity)
    return SEVERITY_RANK[sev] > SEVERITY_RANK[worst] ? sev : worst
  }, 'info')
}

export function buildReviewAgenda(inputs: ReviewAgendaInputs): ReviewAgenda {
  const items: ReviewAgendaItem[] = []

  const warnings = inputs.qualityWarnings ?? []
  if (warnings.length > 0) {
    items.push({
      kind: 'quality_warning',
      count: warnings.length,
      severity: worstWarningSeverity(warnings),
      refs: warnings
        .map((w) => w.type)
        .filter((t): t is string => typeof t === 'string' && t.length > 0),
    })
  }

  const weights = inputs.methodWeights ?? {}
  const activeMethods = Object.entries(weights)
    .filter(([, w]) => typeof w === 'number' && w > 0)
    .map(([k]) => k)
  if (activeMethods.length > 1) {
    items.push({
      kind: 'method_mix',
      count: activeMethods.length,
      severity: 'info',
      refs: activeMethods,
    })
  }

  const normalizationCount = inputs.acceptedNormalizationCount ?? 0
  if (normalizationCount > 0) {
    items.push({
      kind: 'normalization',
      count: normalizationCount,
      severity: 'info',
    })
  }

  const capBreachCount = inputs.capBreachCount ?? 0
  if (capBreachCount > 0) {
    items.push({ kind: 'cap_breach', count: capBreachCount, severity: 'high' })
  }

  const acknowledgementKeys = items.filter((i) => i.severity === 'high').map((i) => i.kind)

  return {
    items,
    acknowledgementKeys,
    requiresReview: acknowledgementKeys.length > 0,
  }
}

/**
 * Lock gate: the report may lock only when every high-severity item has been
 * acknowledged, OR the advisor explicitly skipped with the acknowledge gate.
 */
export function isDiscussionComplete(
  agenda: ReviewAgenda,
  acknowledgedKeys: readonly ReviewItemKind[],
  skipped: boolean
): boolean {
  if (skipped) return true
  return agenda.acknowledgementKeys.every((k) => acknowledgedKeys.includes(k))
}
