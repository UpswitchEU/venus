/**
 * Manual Flow — Startup Valuation Domain
 *
 * Types, constants, and pure helpers for the venture-path valuation store.
 * Keeping these outside the Zustand store lets UI and calculation helpers depend
 * on the domain contract without pulling in persistence/actions.
 */

export type StartupStage = 'pre_seed' | 'seed' | 'series_a'

/**
 * Founder-pickable sector. Drives smart defaults for the VC Method
 * (`exit_revenue_multiple`) on the Python side. Mirrors
 * `apps/valuation-iq/src/domain/startup_valuation/schemas.py`.
 */
export type StartupSector =
  | 'saas'
  | 'marketplace'
  | 'fintech'
  | 'biotech_healthtech'
  | 'deeptech_ai'
  /**
   * Vertical-AI workflow plays (Casetext / Harvey / AlphaSense / Hebbia
   * lane). Application-layer AI that owns a workflow end-to-end with a
   * proprietary data flywheel — distinct from generic SaaS or
   * research-led deeptech.  Trades at premium multiples (10× pre-seed,
   * 11-12× seed/Series A) anchored on the 2023-2026 public-comp set.
   */
  | 'vertical_ai'
  | 'consumer'
  | 'hardware'
  | 'other'

/**
 * Studio v2 — Maturity selector levels.
 *
 * Replaces the 0–100 sliders with discrete, evidence-based statements
 * (Berkus 2024 refresh + Bill Payne 2024 refresh). Each level maps to
 * a 0–100 score that the Python engine continues to consume unchanged
 * — see `MATURITY_TO_SCORE` and `setMaturity` below.
 */
export type MaturityLevel = 'none' | 'basic' | 'strong' | 'exceptional'

/**
 * Maturity → 0–100 score mapping.
 *
 * Calibrated so that:
 *   - `none`          → 0   (no value attributed)
 *   - `basic`         → 40  (initial evidence)
 *   - `strong`        → 75  (defensible evidence)
 *   - `exceptional`   → 100 (top-decile)
 *
 * Mirrors the bands the Python engine effectively maps to in the
 * Berkus/Scorecard math (see `berkus.calculate_berkus`).
 */
export const MATURITY_TO_SCORE: Record<MaturityLevel, number> = {
  none: 0,
  basic: 40,
  strong: 75,
  exceptional: 100,
}

/**
 * Inverse mapping used by the v3 → v4 store migration so existing
 * 0–100 slider scores get bucketed into a sensible maturity level.
 */
export function scoreToMaturity(score: number | null | undefined): MaturityLevel {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return 'none'
  if (score < 50) return 'basic'
  if (score < 90) return 'strong'
  return 'exceptional'
}

/**
 * Strongly-typed milestone keys covered by the Studio v2 wizard.
 * Mirrors the engine's request payload field names so the maturity
 * model is a thin shell over the existing 0–100 fields — Python
 * schema does not move.
 */
export type StudioBerkusKey =
  | 'sound_idea'
  | 'prototype_status'
  | 'management_strength'
  | 'strategic_relationships'
  | 'product_rollout'

export type StudioScorecardKey =
  | 'opportunity_size'
  | 'competitive_environment'
  | 'sales_marketing_channels'
  | 'need_for_additional_funding'
  | 'other_factors'

export type StudioMilestoneKey = StudioBerkusKey | StudioScorecardKey

export const STUDIO_BERKUS_KEYS: readonly StudioBerkusKey[] = [
  'sound_idea',
  'prototype_status',
  'management_strength',
  'strategic_relationships',
  'product_rollout',
] as const

export const STUDIO_SCORECARD_KEYS: readonly StudioScorecardKey[] = [
  'opportunity_size',
  'competitive_environment',
  'sales_marketing_channels',
  'need_for_additional_funding',
  'other_factors',
] as const

export const STUDIO_MILESTONE_KEYS: readonly StudioMilestoneKey[] = [
  ...STUDIO_BERKUS_KEYS,
  ...STUDIO_SCORECARD_KEYS,
] as const

/** Sector → conservative default exit EV/Revenue multiple (mirrors regional_data.py). */
export const STARTUP_SECTOR_EXIT_MULTIPLES: Record<StartupSector, number> = {
  saas: 6,
  marketplace: 4,
  fintech: 8,
  biotech_healthtech: 10,
  deeptech_ai: 9,
  vertical_ai: 10,
  consumer: 3,
  hardware: 3,
  other: 5,
}

/** Sector → conservative default Year-5 revenue (EUR) for a pre-seed/seed startup. */
export const STARTUP_SECTOR_DEFAULT_Y5_REVENUE: Record<StartupSector, number> = {
  saas: 5_000_000,
  marketplace: 8_000_000,
  fintech: 6_000_000,
  biotech_healthtech: 4_000_000,
  deeptech_ai: 5_000_000,
  vertical_ai: 8_000_000,
  consumer: 10_000_000,
  hardware: 12_000_000,
  other: 5_000_000,
}

/**
 * Stage → typical Benelux founder ask (EUR), used as the smart default
 * for the "Investment Amount Sought" field on Screen 3 (VC Method).
 * Matched to Atomico/Dealroom 2024 cohort medians so the cap-table
 * simulator renders something credible the moment a founder lands on
 * the screen — they then tune it to their actual round size.
 */
export const STARTUP_STAGE_DEFAULT_RAISE: Record<StartupStage, number> = {
  pre_seed: 250_000,
  seed: 750_000,
  series_a: 3_000_000,
}

export interface StartupSafeNote {
  id: string
  amount: number | null
  valuation_cap: number | null
  discount_pct: number | null
  holder_label: string
}

/**
 * Founder-pedigree qualification flags. Each is a discrete, defensible
 * claim that drives a multiplicative overlay on the leg-blend baseline.
 * Mirrors `apps/valuation-iq/src/domain/startup_valuation/schemas.py`
 * (`FounderPedigreeInputs`).
 */
export type FounderPedigreeKey =
  | 'prior_exit'
  | 'top_unicorn_alumnus'
  | 'domain_expert_10y'
  | 'second_time_founder'
  | 'has_technical_cofounder'
  | 'solo_founder'

export type FounderPedigreeFlags = Record<FounderPedigreeKey, boolean>

/**
 * Free-text evidence per pedigree claim — LinkedIn URL, KBO incorporation
 * reference, named employer + tenure, etc.  The Python engine zeroes
 * any positive pedigree delta whose evidence string is empty
 * (`founder_pedigree.calculate_founder_pedigree`), so this map is the
 * frontend half of that contract.  ``solo_founder`` is intentionally
 * not in the gate (negative delta — costs the founder, no evidence
 * required to apply).
 */
export type FounderPedigreeEvidence = Partial<
  Record<Exclude<FounderPedigreeKey, 'solo_founder'>, string>
>

/**
 * Max characters per pedigree evidence string — keep in sync with
 * `apps/valuation-iq/src/domain/startup_valuation/schemas.py`
 * ``_MAX_PEDIGREE_EVIDENCE_LEN`` and the FounderPedigreeStep textarea.
 */
export const PEDIGREE_EVIDENCE_MAX_LEN = 500

/**
 * Per-qualification multiplier deltas used by the live receipt to render
 * "+X.XX×" / "-X.XX×" chips next to each option.  Source of truth lives
 * in the Python engine (`founder_pedigree.PEDIGREE_DELTAS`) — this table
 * is a UI-only mirror, kept conservative-by-construction so a UX glitch
 * never flatters the founder above what the engine returns.
 */
export const PEDIGREE_DELTA_PCT: Record<FounderPedigreeKey, number> = {
  prior_exit: 0.3,
  top_unicorn_alumnus: 0.2,
  domain_expert_10y: 0.15,
  second_time_founder: 0.1,
  has_technical_cofounder: 0.1,
  solo_founder: -0.2,
}

export const PEDIGREE_FLOOR = 0.7
export const PEDIGREE_CEILING = 1.8

export const PEDIGREE_KEYS: readonly FounderPedigreeKey[] = [
  'prior_exit',
  'top_unicorn_alumnus',
  'domain_expert_10y',
  'second_time_founder',
  'has_technical_cofounder',
  'solo_founder',
] as const

/** Keys that may carry gated evidence (excludes ``solo_founder``). */
export const PEDIGREE_EVIDENCE_FIELD_KEYS: readonly Exclude<FounderPedigreeKey, 'solo_founder'>[] =
  PEDIGREE_KEYS.filter(
    (k): k is Exclude<FounderPedigreeKey, 'solo_founder'> => k !== 'solo_founder'
  )

/**
 * Evidence strings sent to Titan/ValuationIQ — same contract as Python
 * ``_bound_pedigree_evidence``: known keys only, trim, truncate, omit empties.
 * The store keeps raw text while typing (see `setPedigreeEvidence`).
 */
export function sanitizePedigreeEvidenceMap(
  raw: Partial<Record<string, unknown>>
): FounderPedigreeEvidence {
  const out: FounderPedigreeEvidence = {}
  for (const k of PEDIGREE_EVIDENCE_FIELD_KEYS) {
    const v = raw[k]
    if (typeof v !== 'string') continue
    const t = v.trim().slice(0, PEDIGREE_EVIDENCE_MAX_LEN)
    if (t) out[k] = t
  }
  return out
}

export function pedigreeEvidenceForPayload(raw: FounderPedigreeEvidence): FounderPedigreeEvidence {
  return sanitizePedigreeEvidenceMap(raw)
}

/**
 * Inception lens — opt-in overlay that fixes the three pre-seed gaps
 * the milestone-track methods (Berkus / Scorecard) systematically miss:
 *   1. Moats don't exist yet at inception — momentum is oxygen
 *   2. TAM is unknowable — best founders create new markets
 *   3. Edge founders cost more — paying $30M post for 2% of a Lovable /
 *      Anthropic / Cursor profile is a defensible bet shape
 *
 * Mirrors the Pydantic enum in
 * `apps/valuation-iq/src/domain/startup_valuation/schemas.py::InceptionLens`.
 *
 * Default ``milestones_driven`` is a no-op — every existing payload
 * round-trips bit-for-bit unchanged.  The other two levels apply a
 * multiplier + band widening overlay computed engine-side.
 */
export type InceptionLens = 'milestones_driven' | 'momentum_driven' | 'inception_bet'

/** Per-lens UI mirror of the Python calibration.  Source of truth lives
 *  in `inception_lens.py::_LENS_TABLE`; this table only powers the live
 *  preview, the canonical numbers always come back from the engine. */
export const INCEPTION_LENS_OVERLAY: Record<
  InceptionLens,
  { multiplier: number; bandWidenPct: number }
> = {
  milestones_driven: { multiplier: 1.0, bandWidenPct: 0 },
  momentum_driven: { multiplier: 1.1, bandWidenPct: 0.15 },
  inception_bet: { multiplier: 1.25, bandWidenPct: 0.25 },
}

export const INCEPTION_LENS_ORDER: readonly InceptionLens[] = [
  'milestones_driven',
  'momentum_driven',
  'inception_bet',
] as const

export const INITIAL_PEDIGREE: FounderPedigreeFlags = {
  prior_exit: false,
  top_unicorn_alumnus: false,
  domain_expert_10y: false,
  second_time_founder: false,
  has_technical_cofounder: false,
  solo_founder: false,
}

/**
 * Sum the active qualification deltas + 1.0 base, clamped to the empirical
 * envelope.  Used by the live receipt; the canonical number always comes
 * back from the engine.
 */
export function calculatePedigreeMultiplier(flags: FounderPedigreeFlags): number {
  let raw = 1.0
  for (const key of PEDIGREE_KEYS) {
    if (flags[key]) raw += PEDIGREE_DELTA_PCT[key]
  }
  return Math.min(PEDIGREE_CEILING, Math.max(PEDIGREE_FLOOR, raw))
}

export interface StartupCapTableState {
  pre_money_target: number | null
  option_pool_pct: number
  safe_notes: StartupSafeNote[]
  last_round_amount: number | null
  last_round_post_money: number | null
  last_round_date: string
}

export interface StartupValuationState {
  stage: StartupStage
  country_code: string
  sector: StartupSector

  // Berkus / qualitative milestones (0-100 sliders)
  sound_idea: number
  prototype_status: number
  management_strength: number
  strategic_relationships: number
  product_rollout: number

  // Scorecard inputs (0-100 sliders)
  opportunity_size: number
  competitive_environment: number
  sales_marketing_channels: number
  need_for_additional_funding: number
  other_factors: number

  // Forward-looking traction
  mrr: number | null
  arr: number | null
  mrr_growth_rate_pct: number | null
  monthly_churn_pct: number | null
  cac: number | null
  ltv: number | null
  burn_rate_monthly: number | null
  runway_months: number | null
  team_size: number | null
  /**
   * Engagement signal — MAU/MAA/DAU depending on sector. Feeds the
   * defensibility traction-signal sub-score so a marketplace founder
   * with light revenue but real usage earns more credit than someone
   * with the same revenue and zero engagement.
   */
  active_users: number | null

  // VC method inputs
  year5_revenue_projection: number | null
  exit_revenue_multiple: number | null
  /**
   * Founder-supplied rationale when ``exit_revenue_multiple`` deviates
   * from the sector default. The string lands verbatim in the investor
   * PDF (see VC method table in the startup_valuation report family),
   * so a defensible override always carries its source / comp citation
   * with it. Empty / null when the founder is using the sector
   * default.
   */
  exit_revenue_multiple_rationale: string | null
  target_roi_x: number | null
  dilution_assumption_pct: number | null
  /**
   * Funding amount the founder is currently raising (EUR).
   * Anchors the consortium-spec VC formula
   *   pre_money = (Y5 rev × exit multiple / target ROI) − investment_amount_sought
   * and renders the "if you raise €X you dilute Y%" cap-table simulator
   * on the report.  Seeded from `STARTUP_STAGE_DEFAULT_RAISE` so the
   * field is never empty on first render.
   */
  investment_amount_sought: number | null

  cap_table: StartupCapTableState

  /**
   * Founder-pedigree flags — each is a discrete, defensible claim that
   * the engine converts into a multiplicative overlay on the leg-blend
   * baseline.  Defaults to all-false so a payload that pre-dates this
   * field reads as multiplier 1.0 (no overlay).
   */
  founder_pedigree: FounderPedigreeFlags

  /**
   * Per-claim evidence string (LinkedIn URL / KBO ref / named employer +
   * tenure).  The Python engine's evidence gate zeroes any positive
   * pedigree delta whose evidence string is empty — so without this
   * field every founder pedigree claim would silently collapse to 1.0×.
   * Defaults to an empty object; the FounderPedigreeStep wizard surface
   * collects strings as the founder ticks each claim.
   */
  pedigree_evidence: FounderPedigreeEvidence

  /**
   * Inception lens — opt-in overlay applied AFTER the pedigree multiplier.
   * Acknowledges three pre-seed realities milestone methods miss
   * (moat-blindness, TAM-unknowability, edge-founder premium).  Default
   * `milestones_driven` is a no-op so every existing session round-trips
   * bit-for-bit unchanged.
   */
  inception_lens: InceptionLens

  // ---------------------------------------------------------------
  // Studio v2 — milestone-card state.
  //
  // `maturity` mirrors the legacy 0–100 fields above (`sound_idea`,
  // `prototype_status`, …) but stores the discrete option chosen by
  // the founder.  The 0–100 fields are derived via `setMaturity` so
  // the existing Python engine schema does not move.
  // ---------------------------------------------------------------

  /** Discrete maturity choice per Studio milestone (Berkus + Scorecard). */
  maturity: Record<StudioMilestoneKey, MaturityLevel>

  /**
   * Free-text evidence per milestone — surfaced in the investor PDF as
   * the "why we scored ourselves like this" sentence under each card.
   * Wizard-only state; not threaded into the engine payload (yet — the
   * v2 Claude scorer will consume it).
   */
  evidence_notes: Record<StudioMilestoneKey, string>

  /** Founder-supplied one-liner / pitch (Studio Step 0). */
  description: string

  /**
   * True once the founder has explicitly picked a sector through the UI.
   * Persisted so we never re-seed away from a deliberate choice on a
   * subsequent visit (even if that choice happens to match the default).
   * Internal — not part of the request payload.
   */
  _sectorWasUserSet: boolean

  /**
   * True once the founder has explicitly picked a funding stage through
   * the UI.  Mirrors ``_sectorWasUserSet`` and gates
   * ``seedStageFromFoundingYearIfDefault`` so the registry hit can
   * propose a sensible stage default without ever clobbering an
   * explicit founder pick.  Internal — not part of the request payload.
   */
  _stageWasUserSet: boolean

  /**
   * Founder's explicit answer to "Are you generating revenue yet?".
   * Until 2026-05-10 this lived only as local state inside `TractionStep`,
   * which meant a pre-revenue founder who deliberately picked "no"
   * still showed up as `partial` on the section status — the green
   * checkmark never lit up because completion was inferred from
   * MRR/ARR > 0.  Lifting it to the store gives the panel a proper
   * `complete` signal for pre-revenue founders.
   *
   * Values:
   *   - `'unanswered'`: founder hasn't engaged with the toggle (default).
   *   - `'no'`:        explicitly pre-revenue — drops the SaaS Forward
   *                     leg engine-side via `synthesis._resolve_weights`.
   *   - `'yes'`:       has revenue; expects MRR / growth / churn / CAC.
   *
   * Not part of the request payload; the engine reads MRR/ARR directly.
   */
  revenue_status: 'unanswered' | 'no' | 'yes'
}
