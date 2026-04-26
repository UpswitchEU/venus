/**
 * Manual Flow — Startup Valuation Store
 *
 * Holds the founder-supplied inputs for the 9th valuation method
 * (`startup_valuation`). Kept as a dedicated Zustand slice so the
 * SME ManualResults store stays untouched when the user picks the
 * venture path (KISS / SRP).
 *
 * Mirrors `apps/titan-api/src/valuations/dto/valuation-request.dto.ts`
 * (`startupInputsSchema`) and `apps/valuation-iq/src/domain/startup_valuation/schemas.py`.
 *
 * @module store/manual/useStartupValuationStore
 */

import { create } from 'zustand'
import { inferStartupSectorFromNace } from './inferStartupSectorFromNace'
import { persist } from 'zustand/middleware'

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

const INITIAL_PEDIGREE: FounderPedigreeFlags = {
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

  // VC method inputs
  year5_revenue_projection: number | null
  exit_revenue_multiple: number | null
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

  /** Optional TAM / SAM / SOM trio for the Step 4 exit-story builder. */
  tam_sam_som: { tam: number | null; sam: number | null; som: number | null }

  /**
   * True once the founder has explicitly picked a sector through the UI.
   * Persisted so we never re-seed away from a deliberate choice on a
   * subsequent visit (even if that choice happens to match the default).
   * Internal — not part of the request payload.
   */
  _sectorWasUserSet: boolean
}

interface StartupValuationStore extends StartupValuationState {
  setField: <K extends keyof StartupValuationState>(key: K, value: StartupValuationState[K]) => void
  setCapField: <K extends keyof StartupCapTableState>(key: K, value: StartupCapTableState[K]) => void
  /**
   * Studio v2 setter — picks a maturity level for a milestone and
   * derives the 0–100 score the Python engine consumes.  This is the
   * canonical write hatch from the wizard; legacy slider sections still
   * use `setField` directly.
   */
  setMaturity: (key: StudioMilestoneKey, level: MaturityLevel) => void
  /**
   * One-click preset apply — pre-fills the entire wizard with sensible
   * defaults for a (sector, stage) profile.  See
   * `apps/venus/src/features/startup-studio/data/presets.ts` for the
   * built-in presets.
   *
   * The patch is applied destructively over preset-managed fields
   * (stage, sector, country, maturity, pedigree, VC inputs, TAM/SAM/SOM)
   * so a returning user who picks a different preset gets a clean slate
   * for the new profile.  Free-text fields (`description`, evidence
   * sentences not in the preset) are *preserved* so a founder who already
   * typed their pitch doesn't lose it.
   */
  applyPreset: (preset: import('@/features/startup-studio/data/presets').StudioPreset) => void
  /**
   * Toggle a founder-pedigree qualification.  Picking ``solo_founder``
   * implicitly clears ``has_technical_cofounder`` (and vice-versa) so the
   * UI cannot land in a state where both are checked, which would let
   * the founder claim a discount-AND-lift combo the engine doesn't grant.
   */
  setPedigreeFlag: (key: FounderPedigreeKey, applied: boolean) => void
  /** Studio v2 — evidence note setter (free-text per milestone). */
  setEvidenceNote: (key: StudioMilestoneKey, note: string) => void
  /** Studio v2 — Step 4 TAM/SAM/SOM trio setter. */
  setTamSamSom: (
    next: Partial<{ tam: number | null; sam: number | null; som: number | null }>,
  ) => void
  addSafeNote: () => void
  updateSafeNote: (id: string, patch: Partial<StartupSafeNote>) => void
  removeSafeNote: (id: string) => void
  /**
   * One-shot smart-default for the sector based on a NACE code carried
   * over from Mercury's KBO prefill.  Idempotent and bail-out-safe:
   *   - Never overrides an explicit user choice (`_sectorWasUserSet`).
   *   - Never re-seeds if the inferred sector matches the current one.
   *   - Returns silently when the NACE code is missing or ambiguous.
   * See `inferStartupSectorFromNace` for the mapping table.
   */
  seedSectorFromNaceIfDefault: (nace: string | null | undefined) => void
  reset: () => void
  /** Build the `startup_inputs` payload accepted by Titan / ValuationIQ. */
  toRequestPayload: () => Record<string, unknown>
}

const INITIAL_CAP_TABLE: StartupCapTableState = {
  pre_money_target: null,
  option_pool_pct: 10,
  safe_notes: [],
  last_round_amount: null,
  last_round_post_money: null,
  last_round_date: '',
}

const INITIAL_STATE: StartupValuationState = {
  stage: 'seed',
  country_code: 'BE',
  sector: 'saas',

  sound_idea: 50,
  prototype_status: 25,
  management_strength: 50,
  strategic_relationships: 25,
  product_rollout: 25,

  opportunity_size: 50,
  competitive_environment: 50,
  sales_marketing_channels: 50,
  need_for_additional_funding: 50,
  other_factors: 50,

  mrr: null,
  arr: null,
  mrr_growth_rate_pct: null,
  monthly_churn_pct: null,
  cac: null,
  ltv: null,
  burn_rate_monthly: null,
  runway_months: null,
  team_size: null,

  year5_revenue_projection: null,
  exit_revenue_multiple: null,
  target_roi_x: null,
  dilution_assumption_pct: null,
  // Seeded with the Benelux seed-stage median (€750k) so the cap-table
  // simulator renders meaningfully on first paint — see the field's
  // JSDoc on `StartupValuationState` for why this beats `null`.
  investment_amount_sought: STARTUP_STAGE_DEFAULT_RAISE.seed,

  cap_table: INITIAL_CAP_TABLE,

  founder_pedigree: { ...INITIAL_PEDIGREE },

  inception_lens: 'milestones_driven',

  // Studio v2 ---------------------------------------------------------
  // Default to `none` so the live receipt does not anchor the founder
  // with a phantom €1.7M baseline before they have answered anything.
  maturity: {
    sound_idea: 'none',
    prototype_status: 'none',
    management_strength: 'none',
    strategic_relationships: 'none',
    product_rollout: 'none',
    opportunity_size: 'none',
    competitive_environment: 'none',
    sales_marketing_channels: 'none',
    need_for_additional_funding: 'none',
    other_factors: 'none',
  },
  evidence_notes: {
    sound_idea: '',
    prototype_status: '',
    management_strength: '',
    strategic_relationships: '',
    product_rollout: '',
    opportunity_size: '',
    competitive_environment: '',
    sales_marketing_channels: '',
    need_for_additional_funding: '',
    other_factors: '',
  },
  description: '',
  tam_sam_som: { tam: null, sam: null, som: null },

  _sectorWasUserSet: false,
}

function generateSafeNoteId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `safe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

function omitNull<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
    if (v !== null && v !== undefined && v !== '') {
      out[k] = v
    }
  }
  return out
}

export const useStartupValuationStore = create<StartupValuationStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setField: (key, value) =>
        set((state) => {
          const next: StartupValuationState = { ...state, [key]: value }
          // Mark the sector as user-set so smart-default seeding never
          // silently overrides a deliberate choice on the next session.
          if (key === 'sector') next._sectorWasUserSet = true
          return next
        }),

      setMaturity: (key, level) =>
        set((state) => ({
          ...state,
          maturity: { ...state.maturity, [key]: level },
          // Keep the legacy 0–100 field in lock-step so the engine
          // payload built by `toRequestPayload` is byte-identical to
          // what the legacy slider panel would have produced.
          [key]: MATURITY_TO_SCORE[level],
        }) as StartupValuationState),

      setPedigreeFlag: (key, applied) =>
        set((state) => {
          const next = { ...state.founder_pedigree, [key]: applied }
          // Mutually-exclusive guard: solo founder ↔ technical cofounder.
          // If both were true the engine would still clamp the multiplier,
          // but the UI claim would be incoherent ("I have a cofounder AND
          // I'm solo"). Auto-clear the partner flag when one is picked.
          if (applied && key === 'solo_founder') next.has_technical_cofounder = false
          if (applied && key === 'has_technical_cofounder') next.solo_founder = false
          return { ...state, founder_pedigree: next }
        }),

      applyPreset: (preset) =>
        set((state) => {
          // Derive 0-100 scores from the preset's maturity picks so the
          // engine consumes the same shape it would if a founder had
          // clicked through the wizard.  Mirrors `setMaturity`.
          const maturityFields: Partial<StartupValuationState> = {}
          for (const [key, level] of Object.entries(preset.maturity) as Array<
            [StudioMilestoneKey, MaturityLevel]
          >) {
            ;(maturityFields as Record<string, unknown>)[key] = MATURITY_TO_SCORE[level]
          }

          // Merge evidence notes — preset overrides only those it
          // explicitly sets; founder's own sentences for other milestones
          // survive.
          const nextEvidence = { ...state.evidence_notes }
          if (preset.evidence_notes) {
            for (const [key, note] of Object.entries(preset.evidence_notes)) {
              if (note != null) {
                nextEvidence[key as StudioMilestoneKey] = note
              }
            }
          }

          return {
            ...state,
            ...maturityFields,
            stage: preset.stage,
            sector: preset.sector,
            country_code: preset.country_code,
            investment_amount_sought: preset.investment_amount_sought,
            description: preset.description ?? state.description,
            maturity: { ...state.maturity, ...preset.maturity },
            evidence_notes: nextEvidence,
            founder_pedigree: { ...preset.founder_pedigree },
            ...(preset.year5_revenue_projection != null
              ? { year5_revenue_projection: preset.year5_revenue_projection }
              : {}),
            ...(preset.exit_revenue_multiple != null
              ? { exit_revenue_multiple: preset.exit_revenue_multiple }
              : {}),
            ...(preset.target_roi_x != null ? { target_roi_x: preset.target_roi_x } : {}),
            ...(preset.tam_sam_som ? { tam_sam_som: preset.tam_sam_som } : {}),
            // Mark sector as user-set so the NACE auto-seed never silently
            // overrides what the preset picked.
            _sectorWasUserSet: true,
          } as StartupValuationState
        }),

      setEvidenceNote: (key, note) =>
        set((state) => ({
          ...state,
          evidence_notes: { ...state.evidence_notes, [key]: note },
        })),

      setTamSamSom: (next) =>
        set((state) => ({
          ...state,
          tam_sam_som: { ...state.tam_sam_som, ...next },
        })),

      seedSectorFromNaceIfDefault: (nace) =>
        set((state) => {
          if (state._sectorWasUserSet) return state
          const inferred = inferStartupSectorFromNace(nace)
          if (!inferred || inferred === state.sector) return state
          // Note: we deliberately do NOT flip `_sectorWasUserSet` here —
          // the user is still free to override, and we still want to
          // re-evaluate if the underlying NACE prefill changes mid-session.
          return { ...state, sector: inferred }
        }),

      setCapField: (key, value) =>
        set((state) => ({
          ...state,
          cap_table: { ...state.cap_table, [key]: value },
        })),

      addSafeNote: () =>
        set((state) => ({
          ...state,
          cap_table: {
            ...state.cap_table,
            safe_notes: [
              ...state.cap_table.safe_notes,
              {
                id: generateSafeNoteId(),
                amount: null,
                valuation_cap: null,
                discount_pct: 20,
                holder_label: '',
              },
            ],
          },
        })),

      updateSafeNote: (id, patch) =>
        set((state) => ({
          ...state,
          cap_table: {
            ...state.cap_table,
            safe_notes: state.cap_table.safe_notes.map((n) =>
              n.id === id ? { ...n, ...patch } : n
            ),
          },
        })),

      removeSafeNote: (id) =>
        set((state) => ({
          ...state,
          cap_table: {
            ...state.cap_table,
            safe_notes: state.cap_table.safe_notes.filter((n) => n.id !== id),
          },
        })),

      reset: () => set(() => ({ ...INITIAL_STATE })),

      toRequestPayload: () => {
        const state = get()
        const capTable = omitNull({
          pre_money_target: state.cap_table.pre_money_target,
          option_pool_pct: state.cap_table.option_pool_pct,
          last_round_amount: state.cap_table.last_round_amount,
          last_round_post_money: state.cap_table.last_round_post_money,
          last_round_date: state.cap_table.last_round_date,
        })
        const safe_notes = state.cap_table.safe_notes
          .filter((n) => typeof n.amount === 'number' && n.amount > 0)
          .map((n) =>
            omitNull({
              amount: n.amount,
              valuation_cap: n.valuation_cap,
              discount_pct: n.discount_pct,
              holder_label: n.holder_label,
            })
          )

        // Studio v2 metadata — wizard-only signals that the engine
        // ignores today (the v2 Claude scorer will read them).
        const hasEvidence = Object.values(state.evidence_notes).some((v) => v.trim().length > 0)
        const studioMetadata: Record<string, unknown> = {}
        if (state.description.trim()) studioMetadata.description = state.description.trim()
        if (hasEvidence) {
          studioMetadata.evidence_notes = Object.fromEntries(
            Object.entries(state.evidence_notes).filter(([, v]) => v.trim().length > 0),
          )
        }
        if (
          state.tam_sam_som.tam != null ||
          state.tam_sam_som.sam != null ||
          state.tam_sam_som.som != null
        ) {
          studioMetadata.tam_sam_som = state.tam_sam_som
        }

        return {
          stage: state.stage,
          country_code: state.country_code || 'BE',
          sector: state.sector,
          sound_idea: state.sound_idea,
          prototype_status: state.prototype_status,
          management_strength: state.management_strength,
          strategic_relationships: state.strategic_relationships,
          product_rollout: state.product_rollout,
          opportunity_size: state.opportunity_size,
          competitive_environment: state.competitive_environment,
          sales_marketing_channels: state.sales_marketing_channels,
          need_for_additional_funding: state.need_for_additional_funding,
          other_factors: state.other_factors,
          ...omitNull({
            mrr: state.mrr,
            arr: state.arr,
            mrr_growth_rate_pct: state.mrr_growth_rate_pct,
            monthly_churn_pct: state.monthly_churn_pct,
            cac: state.cac,
            ltv: state.ltv,
            burn_rate_monthly: state.burn_rate_monthly,
            runway_months: state.runway_months,
            team_size: state.team_size,
            year5_revenue_projection: state.year5_revenue_projection,
            exit_revenue_multiple: state.exit_revenue_multiple,
            target_roi_x: state.target_roi_x,
            dilution_assumption_pct: state.dilution_assumption_pct,
            investment_amount_sought: state.investment_amount_sought,
          }),
          cap_table: { ...capTable, safe_notes },
          // Inception lens — only thread the field through when the
          // founder has explicitly opted into a non-default lens.
          // Engine treats absence as `milestones_driven` (no-op), so an
          // explicit default would be a wasteful round-trip.
          ...(state.inception_lens && state.inception_lens !== 'milestones_driven'
            ? { inception_lens: state.inception_lens }
            : {}),
          // Include the pedigree object only when at least one flag is set.
          // The engine treats the absence of the field as "no overlay"
          // (default multiplier 1.0), so an all-false payload would be a
          // wasteful round-trip with the same outcome.
          ...(Object.values(state.founder_pedigree).some(Boolean)
            ? { founder_pedigree: state.founder_pedigree }
            : {}),
          ...(Object.keys(studioMetadata).length > 0 ? { studio_v2: studioMetadata } : {}),
        }
      },
    }),
    {
      name: 'venus.startup_valuation.v1',
      version: 6,
      // Migration history:
      //   v1 → v2: added `_sectorWasUserSet` flag (NACE smart-default guard).
      //   v2 → v3: added `investment_amount_sought` (consortium-spec VC
      //            anchor + cap-table simulator).  Seeded with the
      //            Benelux seed-stage median so returning users see a
      //            credible cap-table simulator on first re-open
      //            instead of a blank field.
      //   v3 → v4: Studio v2 — added `maturity`, `evidence_notes`,
      //            `description`, `tam_sam_som`.  The 0–100 fields are
      //            preserved (the engine still consumes them); maturity
      //            is bucketed from the existing scores so legacy users
      //            land on a wizard pre-filled with their last picks.
      //   v4 → v5: founder pedigree overlay — added `founder_pedigree`
      //            flags (six discrete qualifications).  Defaults to
      //            all-false so returning users see no behaviour change
      //            until they actively pick a qualification.
      //   v5 → v6: inception lens — added `inception_lens` (3-level
      //            opt-in overlay fixing the moat-blindness, TAM-
      //            unknowability and edge-premium gaps).  Defaults to
      //            `milestones_driven` (no-op) so returning users see
      //            no change until they actively pick momentum_driven
      //            or inception_bet on the new picker.
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as StartupValuationState
        }
        const s = persistedState as Partial<StartupValuationState> & Record<string, unknown>
        if (version < 2 && s._sectorWasUserSet === undefined) {
          s._sectorWasUserSet = false
        }
        if (version < 3 && s.investment_amount_sought === undefined) {
          s.investment_amount_sought = STARTUP_STAGE_DEFAULT_RAISE.seed
        }
        if (version < 4) {
          // Bucket the persisted 0–100 scores into discrete maturity
          // levels so the v2 wizard has something to highlight without
          // pestering the founder to re-answer.
          const inferMaturity = (raw: unknown): MaturityLevel => {
            const n = typeof raw === 'number' ? raw : Number(raw)
            return scoreToMaturity(Number.isFinite(n) ? n : 0)
          }
          if (!s.maturity) {
            s.maturity = {
              sound_idea: inferMaturity(s.sound_idea),
              prototype_status: inferMaturity(s.prototype_status),
              management_strength: inferMaturity(s.management_strength),
              strategic_relationships: inferMaturity(s.strategic_relationships),
              product_rollout: inferMaturity(s.product_rollout),
              opportunity_size: inferMaturity(s.opportunity_size),
              competitive_environment: inferMaturity(s.competitive_environment),
              sales_marketing_channels: inferMaturity(s.sales_marketing_channels),
              need_for_additional_funding: inferMaturity(s.need_for_additional_funding),
              other_factors: inferMaturity(s.other_factors),
            }
          }
          if (!s.evidence_notes) {
            s.evidence_notes = {
              sound_idea: '',
              prototype_status: '',
              management_strength: '',
              strategic_relationships: '',
              product_rollout: '',
              opportunity_size: '',
              competitive_environment: '',
              sales_marketing_channels: '',
              need_for_additional_funding: '',
              other_factors: '',
            }
          }
          if (s.description === undefined) s.description = ''
          if (!s.tam_sam_som) s.tam_sam_som = { tam: null, sam: null, som: null }
        }
        if (version < 5) {
          // Default to all-false so the multiplier is 1.0 (no overlay) for
          // every persisted user — the founder explicitly opts in by
          // picking a qualification on the new wizard step.
          if (!s.founder_pedigree) {
            s.founder_pedigree = { ...INITIAL_PEDIGREE }
          }
        }
        if (version < 6) {
          // Default to the no-op lens so persisted users see exactly
          // the same engine output as before — the founder must
          // actively opt in via the new InceptionLensPicker for the
          // overlay to apply.
          if (!s.inception_lens) {
            s.inception_lens = 'milestones_driven'
          }
        }
        return s as StartupValuationState
      },
      partialize: (state) => {
        const {
          setField,
          setCapField,
          setMaturity,
          setPedigreeFlag,
          applyPreset,
          setEvidenceNote,
          setTamSamSom,
          addSafeNote,
          updateSafeNote,
          removeSafeNote,
          seedSectorFromNaceIfDefault,
          reset,
          toRequestPayload,
          ...rest
        } = state
        void setField
        void setCapField
        void setMaturity
        void setPedigreeFlag
        void applyPreset
        void setEvidenceNote
        void setTamSamSom
        void addSafeNote
        void updateSafeNote
        void removeSafeNote
        void seedSectorFromNaceIfDefault
        void reset
        void toRequestPayload
        return rest
      },
    }
  )
)
