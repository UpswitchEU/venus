/**
 * BET-325 — Venus-side mirror of Titan's `MethodWeightsDataPlan`
 * (`apps/titan-api/src/ai/method-manifest/method-weights-selection.util.ts`).
 *
 * The agent's per-method "data input plan": for each weighted valuation method,
 * which inputs the engine still needs from the owner/advisor (`fieldsToCollect`)
 * to unlock or firm up that method. Produced by the `propose_method_weights_selection`
 * tool, persisted on the `method_selection_events.data_input_plan` row, and surfaced
 * read-only in the adaptive left panel ({@link MethodDataPlanPanel}).
 *
 * Kept structurally loose (plain strings) on purpose — Venus only renders `method`
 * + `fieldsToCollect`; the rich manifest typing stays on the Titan side. Anything
 * unrecognised in the payload is dropped by the normaliser, never trusted blindly.
 */
export interface MethodDataPlanEntry {
  /** Canonical valuation method key (e.g. `dcf`, `ebitda_multiple`). */
  method: string
  /** Keys of the fields that genuinely need a user/owner value (the rest auto-fill). */
  fieldsToCollect: string[]
  /** Manifest sections the method requires (informational; optional). */
  requiredInputSections?: string[]
}

export interface MethodWeightsDataPlan {
  /** The single highest-leverage data action for this stage. */
  nextDataAction: string
  perMethod: MethodDataPlanEntry[]
  unlockHint: string | null
}
