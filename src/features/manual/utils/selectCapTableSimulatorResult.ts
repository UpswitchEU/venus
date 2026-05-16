/**
 * Pure selector for the cap-table simulator mount in ``ManualLayout``.
 *
 * Returns the ``ValuationMethodResult`` whose ``details.cap_table_simulator``
 * payload should drive the live React slider above the HTML report —
 * or ``null`` when the slider should not render.
 *
 * Method-agnostic by design: the engine emits the same payload shape
 * from ``startup_valuation`` (always) and from ``arr_multiple`` (when
 * the founder filled in capital history / an investment ask via the
 * SaaS ``CapitalHistorySection``).  Adding a third method later is
 * a no-op here — the gate inspects ``details``, not the method key.
 *
 * Advisor flows are explicitly excluded (they keep the pure HTML
 * report) so accountant-side workflows are untouched.
 */

import type { ValuationMethodResult } from '@/types/valuation'

export interface SelectCapTableSimulatorResultOptions {
  /** Active "advisor" surface flag — when true, never render the slider. */
  showFullAdvisorMethodNav: boolean
  /** Currently selected method key (e.g. ``'arr_multiple'``, ``'startup_valuation'``). */
  selectedMethod: string | null | undefined
  /** Full ``valuation_results`` map from the engine response. */
  valuationResults: Record<string, ValuationMethodResult> | null | undefined
}

export function selectCapTableSimulatorResult(
  opts: SelectCapTableSimulatorResultOptions
): ValuationMethodResult | null {
  if (opts.showFullAdvisorMethodNav) return null
  if (!opts.selectedMethod) return null
  const candidate = opts.valuationResults?.[opts.selectedMethod] ?? null
  if (!candidate) return null
  const details = candidate.details as Record<string, unknown> | null | undefined
  const sim = details?.cap_table_simulator
  return sim && typeof sim === 'object' ? candidate : null
}
