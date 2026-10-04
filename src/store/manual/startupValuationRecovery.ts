import type { StartupValuationState } from './startupValuationDomain'
import { INITIAL_STARTUP_VALUATION_STATE } from './startupValuationInitialState'

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function sameShape(value: unknown, template: unknown): boolean {
  if (template === null)
    return value === null || (typeof value === 'number' && Number.isFinite(value))
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (typeof template === 'string') return typeof value === 'string' && value.length <= 10_000
  if (typeof template === 'boolean') return typeof value === 'boolean'
  if (!record(template) || !record(value)) return false
  return (
    Object.keys(template).length === Object.keys(value).length &&
    Object.entries(template).every(([key, sample]) => sameShape(value[key], sample))
  )
}

/** Reject corrupt or injected state before Zustand's shallow merge can restore it. */
export function isStartupRecoveryState(value: unknown): value is StartupValuationState {
  if (!record(value) || !record(value.cap_table) || !record(value.pedigree_evidence)) return false
  const {
    cap_table: cap,
    pedigree_evidence: evidence,
    exit_revenue_multiple_rationale: rationale,
    ...rest
  } = value
  const {
    cap_table: initialCap,
    pedigree_evidence: _evidence,
    exit_revenue_multiple_rationale: _rationale,
    ...template
  } = INITIAL_STARTUP_VALUATION_STATE
  const { safe_notes: notes, ...capRest } = cap
  const { safe_notes: _notes, ...capTemplate } = initialCap
  const noteTemplate = {
    id: '',
    amount: null,
    valuation_cap: null,
    discount_pct: null,
    holder_label: '',
  }
  return (
    sameShape(rest, template) &&
    sameShape(capRest, capTemplate) &&
    (rationale === null || (typeof rationale === 'string' && rationale.length <= 10_000)) &&
    Array.isArray(notes) &&
    notes.length <= 100 &&
    notes.every((note) => sameShape(note, noteTemplate)) &&
    Object.entries(evidence).every(
      ([key, text]) =>
        key !== 'solo_founder' &&
        Object.hasOwn(INITIAL_STARTUP_VALUATION_STATE.founder_pedigree, key) &&
        typeof text === 'string' &&
        text.length <= 500
    )
  )
}
