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
import { persist } from 'zustand/middleware'
import { normalizePreMoneyTarget } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import { inferStartupSectorFromNace } from './inferStartupSectorFromNace'
import { inferStartupStageFromFoundingYear } from './inferStartupStageFromFoundingYear'
import type {
  FounderPedigreeEvidence,
  FounderPedigreeKey,
  MaturityLevel,
  StartupCapTableState,
  StartupSafeNote,
  StartupSector,
  StartupStage,
  StartupValuationState,
  StudioMilestoneKey,
} from './startupValuationDomain'
import {
  INITIAL_PEDIGREE,
  MATURITY_TO_SCORE,
  PEDIGREE_EVIDENCE_MAX_LEN,
  pedigreeEvidenceForPayload,
  STARTUP_STAGE_DEFAULT_RAISE,
  sanitizePedigreeEvidenceMap,
  scoreToMaturity,
} from './startupValuationDomain'

export type {
  FounderPedigreeEvidence,
  FounderPedigreeFlags,
  FounderPedigreeKey,
  InceptionLens,
  MaturityLevel,
  StartupCapTableState,
  StartupSafeNote,
  StartupSector,
  StartupStage,
  StartupValuationState,
  StudioBerkusKey,
  StudioMilestoneKey,
  StudioScorecardKey,
} from './startupValuationDomain'
export {
  calculatePedigreeMultiplier,
  INCEPTION_LENS_ORDER,
  INCEPTION_LENS_OVERLAY,
  MATURITY_TO_SCORE,
  PEDIGREE_CEILING,
  PEDIGREE_DELTA_PCT,
  PEDIGREE_EVIDENCE_FIELD_KEYS,
  PEDIGREE_EVIDENCE_MAX_LEN,
  PEDIGREE_FLOOR,
  PEDIGREE_KEYS,
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STARTUP_SECTOR_EXIT_MULTIPLES,
  STARTUP_STAGE_DEFAULT_RAISE,
  STUDIO_BERKUS_KEYS,
  STUDIO_MILESTONE_KEYS,
  STUDIO_SCORECARD_KEYS,
  scoreToMaturity,
} from './startupValuationDomain'

interface StartupValuationStore extends StartupValuationState {
  setField: <K extends keyof StartupValuationState>(key: K, value: StartupValuationState[K]) => void
  setCapField: <K extends keyof StartupCapTableState>(
    key: K,
    value: StartupCapTableState[K]
  ) => void
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
  /**
   * Set the per-claim evidence string (LinkedIn URL / KBO ref / named
   * employer + tenure).  Only positive pedigree claims accept evidence —
   * the type narrows ``key`` to exclude ``solo_founder``.  Passing an
   * empty / whitespace-only string removes the key from the persisted
   * dict so the engine sees "no evidence" rather than an empty string.
   *
   * Values are stored **as typed** (no per-keystroke trim) so spaces work
   * in the textarea.  Strings longer than ``PEDIGREE_EVIDENCE_MAX_LEN``
   * are truncated to match ValuationIQ bounds.  `toRequestPayload` applies
   * the same normalization (trim + known keys + cap) before Titan.
   */
  setPedigreeEvidence: (key: Exclude<FounderPedigreeKey, 'solo_founder'>, evidence: string) => void
  /** Studio v2 — evidence note setter (free-text per milestone). */
  setEvidenceNote: (key: StudioMilestoneKey, note: string) => void
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
  /**
   * Smart-default for the funding stage based on the registry-supplied
   * founding year.  Mirrors ``seedSectorFromNaceIfDefault`` exactly:
   *   - Never overrides an explicit user choice (`_stageWasUserSet`).
   *   - Never re-seeds if the inferred stage matches the current one.
   *   - Returns silently when the founding year is missing, malformed,
   *     or implies a future incorporation.
   *
   * Called from the KBO/KVK registry handler in ``CompanyCardStep``
   * once a registry hit lands.  See ``inferStartupStageFromFoundingYear``
   * for the cohort buckets.  Audit 2026-05-10: the wizard previously
   * never did this, so a 2024-incorporated founder always saw the
   * default ``'seed'`` until they manually flipped it.
   */
  seedStageFromFoundingYearIfDefault: (year: number | null | undefined) => void
  reset: () => void
  /** Build the `startup_inputs` payload accepted by Titan / ValuationIQ. */
  toRequestPayload: () => Record<string, unknown>
  /**
   * Apply a snapshot from a backend session payload back into the store.
   * Mirrors the SME canonical flow where `SessionRestorationService`
   * rehydrates `useManualFormStore` from the saved session.  Studio v2
   * lives outside that pipeline (no normalizer extracts `startup_inputs`),
   * so we do the work explicitly here on a per-report mount.
   *
   * Defensive: silently ignores fields not present in the snapshot, so
   * partial payloads (older Titan schemas, in-flight migrations) never
   * blow up the founder's session.  Existing fields not in the snapshot
   * are preserved.
   */
  applyFromSnapshot: (snapshot: Record<string, unknown> | null | undefined) => void
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
  active_users: null,

  year5_revenue_projection: null,
  exit_revenue_multiple: null,
  exit_revenue_multiple_rationale: null,
  target_roi_x: null,
  dilution_assumption_pct: null,
  // Seeded with the Benelux seed-stage median (€750k) so the cap-table
  // simulator renders meaningfully on first paint — see the field's
  // JSDoc on `StartupValuationState` for why this beats `null`.
  investment_amount_sought: STARTUP_STAGE_DEFAULT_RAISE.seed,

  cap_table: INITIAL_CAP_TABLE,

  founder_pedigree: { ...INITIAL_PEDIGREE },
  pedigree_evidence: {},

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

  _sectorWasUserSet: false,
  _stageWasUserSet: false,
  revenue_status: 'unanswered',
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
          // Same gate for stage — once the founder picks a stage, the
          // registry-driven inference ``seedStageFromFoundingYearIfDefault``
          // refuses to clobber it.
          if (key === 'stage') next._stageWasUserSet = true
          return next
        }),

      setMaturity: (key, level) =>
        set(
          (state) =>
            ({
              ...state,
              maturity: { ...state.maturity, [key]: level },
              // Keep the legacy 0–100 field in lock-step so the engine
              // payload built by `toRequestPayload` is byte-identical to
              // what the legacy slider panel would have produced.
              [key]: MATURITY_TO_SCORE[level],
            }) as StartupValuationState
        ),

      setPedigreeFlag: (key, applied) =>
        set((state) => {
          const next = { ...state.founder_pedigree, [key]: applied }
          // Mutually-exclusive guard: solo founder ↔ technical cofounder.
          // If both were true the engine would still clamp the multiplier,
          // but the UI claim would be incoherent ("I have a cofounder AND
          // I'm solo"). Auto-clear the partner flag when one is picked.
          if (applied && key === 'solo_founder') next.has_technical_cofounder = false
          if (applied && key === 'has_technical_cofounder') next.solo_founder = false
          // Clear evidence when the founder un-ticks a claim.  Keeping a
          // stale evidence string would silently re-apply the multiplier
          // if the founder later re-ticks the same claim — that would
          // surprise the defensibility-score "evidence not provided"
          // signal.  ``solo_founder`` is excluded from the evidence dict
          // by the type contract, so we only clear the positive keys.
          let evidence = state.pedigree_evidence
          if (!applied && key !== 'solo_founder') {
            const { [key]: _removed, ...rest } = state.pedigree_evidence
            evidence = rest
          }
          return { ...state, founder_pedigree: next, pedigree_evidence: evidence }
        }),

      setPedigreeEvidence: (key, evidence) =>
        set((state) => {
          // Only treat whitespace-only as empty — do not trim() what we
          // persist: trimming on every onChange would strip the trailing
          // space after each word and make the textarea impossible to use.
          if (!evidence.trim()) {
            const { [key]: _removed, ...rest } = state.pedigree_evidence
            return { ...state, pedigree_evidence: rest }
          }
          const capped =
            evidence.length > PEDIGREE_EVIDENCE_MAX_LEN
              ? evidence.slice(0, PEDIGREE_EVIDENCE_MAX_LEN)
              : evidence
          return {
            ...state,
            pedigree_evidence: { ...state.pedigree_evidence, [key]: capped },
          }
        }),

      applyPreset: (preset) => {
        // Build a snapshot in the same shape `toRequestPayload` produces,
        // then delegate to `applyFromSnapshot` so the bulk-apply logic
        // (validation, merging, _sectorWasUserSet flag) lives in exactly
        // one place.  Preset-specific work — only the `MaturityLevel` →
        // 0–100 score derivation — happens here, before delegation.
        const scores: Record<string, number> = {}
        for (const [key, level] of Object.entries(preset.maturity) as Array<
          [StudioMilestoneKey, MaturityLevel]
        >) {
          scores[key] = MATURITY_TO_SCORE[level]
        }
        get().applyFromSnapshot({
          stage: preset.stage,
          sector: preset.sector,
          country_code: preset.country_code,
          investment_amount_sought: preset.investment_amount_sought,
          ...scores,
          maturity: preset.maturity,
          founder_pedigree: preset.founder_pedigree,
          ...(preset.description != null ? { description: preset.description } : {}),
          ...(preset.evidence_notes ? { evidence_notes: preset.evidence_notes } : {}),
          ...(preset.year5_revenue_projection != null
            ? { year5_revenue_projection: preset.year5_revenue_projection }
            : {}),
          ...(preset.exit_revenue_multiple != null
            ? { exit_revenue_multiple: preset.exit_revenue_multiple }
            : {}),
          ...(preset.target_roi_x != null ? { target_roi_x: preset.target_roi_x } : {}),
        })
      },

      setEvidenceNote: (key, note) =>
        set((state) => ({
          ...state,
          evidence_notes: { ...state.evidence_notes, [key]: note },
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

      seedStageFromFoundingYearIfDefault: (year) =>
        set((state) => {
          if (state._stageWasUserSet) return state
          const inferred = inferStartupStageFromFoundingYear({ foundingYear: year })
          if (!inferred || inferred === state.stage) return state
          // Same convention as the sector seeder: we do NOT flip the
          // user-set flag here, so a later registry hit (different
          // company picked) can still re-seed.
          return { ...state, stage: inferred }
        }),

      setCapField: <K extends keyof StartupCapTableState>(key: K, value: StartupCapTableState[K]) =>
        set((state) => ({
          ...state,
          cap_table: {
            ...state.cap_table,
            [key]:
              key === 'pre_money_target'
                ? (normalizePreMoneyTarget(value as number | null) as StartupCapTableState[K])
                : value,
          },
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

      applyFromSnapshot: (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') return
        const s = snapshot as Record<string, unknown>
        set((state) => {
          const next = { ...state }
          // Identity / framing fields ----------------------------------
          if (
            typeof s.stage === 'string' &&
            (['pre_seed', 'seed', 'series_a'] as const).includes(s.stage as StartupStage)
          ) {
            next.stage = s.stage as StartupStage
          }
          if (typeof s.country_code === 'string' && s.country_code.trim()) {
            next.country_code = s.country_code.trim().toUpperCase()
          }
          if (typeof s.sector === 'string') {
            const valid: StartupSector[] = [
              'saas',
              'marketplace',
              'fintech',
              'biotech_healthtech',
              'deeptech_ai',
              'vertical_ai',
              'consumer',
              'hardware',
              'other',
            ]
            if (valid.includes(s.sector as StartupSector)) {
              next.sector = s.sector as StartupSector
              // Treat a server-restored sector as user-set so the NACE
              // smart-default never silently overrides it on rehydrate.
              next._sectorWasUserSet = true
            }
          }
          // Berkus + Scorecard 0–100 fields ----------------------------
          for (const key of [
            'sound_idea',
            'prototype_status',
            'management_strength',
            'strategic_relationships',
            'product_rollout',
            'opportunity_size',
            'competitive_environment',
            'sales_marketing_channels',
            'need_for_additional_funding',
            'other_factors',
          ] as const) {
            const v = s[key]
            if (typeof v === 'number' && Number.isFinite(v)) {
              next[key] = v
            }
          }
          // Forward-looking SaaS metrics + VC inputs (nullable) --------
          for (const key of [
            'mrr',
            'arr',
            'mrr_growth_rate_pct',
            'monthly_churn_pct',
            'cac',
            'ltv',
            'burn_rate_monthly',
            'runway_months',
            'team_size',
            'active_users',
            'year5_revenue_projection',
            'exit_revenue_multiple',
            'target_roi_x',
            'dilution_assumption_pct',
            'investment_amount_sought',
          ] as const) {
            const v = s[key]
            if (typeof v === 'number' && Number.isFinite(v)) {
              next[key] = v
            } else if (v === null) {
              next[key] = null
            }
          }
          // Cap table + SAFE notes ------------------------------------
          if (s.cap_table && typeof s.cap_table === 'object') {
            const ct = s.cap_table as Record<string, unknown>
            next.cap_table = {
              ...next.cap_table,
              ...(typeof ct.pre_money_target === 'number' || ct.pre_money_target === null
                ? {
                    pre_money_target: normalizePreMoneyTarget(ct.pre_money_target as number | null),
                  }
                : {}),
              ...(typeof ct.option_pool_pct === 'number'
                ? { option_pool_pct: ct.option_pool_pct }
                : {}),
              ...(typeof ct.last_round_amount === 'number' || ct.last_round_amount === null
                ? { last_round_amount: ct.last_round_amount as number | null }
                : {}),
              ...(typeof ct.last_round_post_money === 'number' || ct.last_round_post_money === null
                ? { last_round_post_money: ct.last_round_post_money as number | null }
                : {}),
              ...(typeof ct.last_round_date === 'string'
                ? { last_round_date: ct.last_round_date }
                : {}),
              ...(Array.isArray(ct.safe_notes)
                ? {
                    safe_notes: (ct.safe_notes as Array<Record<string, unknown>>).map(
                      (note, idx) => ({
                        id:
                          typeof note.id === 'string' && note.id
                            ? note.id
                            : `safe-${Date.now()}-${idx}`,
                        amount:
                          typeof note.amount === 'number' && Number.isFinite(note.amount)
                            ? note.amount
                            : null,
                        valuation_cap:
                          typeof note.valuation_cap === 'number' &&
                          Number.isFinite(note.valuation_cap)
                            ? note.valuation_cap
                            : null,
                        discount_pct:
                          typeof note.discount_pct === 'number' &&
                          Number.isFinite(note.discount_pct)
                            ? note.discount_pct
                            : null,
                        holder_label:
                          typeof note.holder_label === 'string' ? note.holder_label : '',
                      })
                    ),
                  }
                : {}),
            }
          }
          // Founder pedigree flags -------------------------------------
          if (s.founder_pedigree && typeof s.founder_pedigree === 'object') {
            const fp = s.founder_pedigree as Record<string, unknown>
            const merged: Record<string, boolean> = { ...next.founder_pedigree }
            for (const k of Object.keys(merged)) {
              if (typeof fp[k] === 'boolean') merged[k] = fp[k] as boolean
            }
            next.founder_pedigree = merged as typeof next.founder_pedigree

            // Pedigree evidence dict — accepted in two shapes:
            //   1. Top-level ``pedigree_evidence`` (current frontend store)
            //   2. Nested under ``founder_pedigree.pedigree_evidence``
            //      (the engine's payload contract — what the request
            //      sends to the backend).  Restore from either so a
            //      session round-tripped through the API doesn't lose
            //      the evidence strings.
            const pickEvidence = (raw: unknown): FounderPedigreeEvidence => {
              if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
              return sanitizePedigreeEvidenceMap(raw as Record<string, unknown>)
            }
            const fromTop = pickEvidence(s.pedigree_evidence)
            const fromNested = pickEvidence(fp.pedigree_evidence)
            const restored = { ...fromNested, ...fromTop }
            if (Object.keys(restored).length > 0) {
              next.pedigree_evidence = restored
            }
          }
          // Studio v2 — maturity buckets + evidence + description ------
          if (s.maturity && typeof s.maturity === 'object') {
            const m = s.maturity as Record<string, unknown>
            const merged: Record<string, MaturityLevel> = { ...next.maturity }
            for (const k of Object.keys(merged)) {
              const v = m[k]
              if (
                typeof v === 'string' &&
                (['none', 'basic', 'strong', 'exceptional'] as const).includes(v as MaturityLevel)
              ) {
                merged[k] = v as MaturityLevel
              }
            }
            next.maturity = merged as typeof next.maturity
          }
          // Studio v2 metadata — `studio_v2` carries description /
          // evidence_notes / tam_sam_som that the engine doesn't read
          // today but the report rendering does.  Read both flat keys
          // and the nested `studio_v2` wrapper for forward-compat.
          const v2 =
            s.studio_v2 && typeof s.studio_v2 === 'object'
              ? (s.studio_v2 as Record<string, unknown>)
              : ({} as Record<string, unknown>)
          const description = (s.description ?? v2.description) as unknown
          if (typeof description === 'string') next.description = description
          const evidenceNotes = (s.evidence_notes ?? v2.evidence_notes) as unknown
          if (evidenceNotes && typeof evidenceNotes === 'object') {
            const merged: Record<string, string> = { ...next.evidence_notes }
            for (const [k, v] of Object.entries(evidenceNotes as Record<string, unknown>)) {
              if (k in merged && typeof v === 'string') merged[k] = v
            }
            next.evidence_notes = merged as typeof next.evidence_notes
          }
          // TAM/SAM/SOM was removed 2026-05-08; any persisted snapshot
          // that still carries it under top-level or `studio_v2` keys
          // is silently dropped here so legacy localStorage / API
          // round-trips don't crash the restore.
          if (typeof s.inception_lens === 'string') {
            next.inception_lens = s.inception_lens as typeof next.inception_lens
          }
          return next
        })
      },

      toRequestPayload: () => {
        const state = get()
        const capTable = omitNull({
          pre_money_target: normalizePreMoneyTarget(state.cap_table.pre_money_target),
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
            Object.entries(state.evidence_notes).filter(([, v]) => v.trim().length > 0)
          )
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
            // ARR auto-derive: the ValuationIQ SaaS-Forward leg gates on
            // ``inputs.arr > 0`` ([saas_forward.py:191]). The wizard's
            // Traction step accepts MRR alone as a "yes, has revenue"
            // signal, so a founder who fills in MRR=€5k and skips ARR
            // would have the SaaS-Forward leg silently dropped engine-side
            // (audit issue #9). Backfill ARR = MRR × 12 here so the
            // engine sees what the wizard's preview already showed.
            arr:
              state.arr != null
                ? state.arr
                : typeof state.mrr === 'number' && state.mrr > 0
                  ? state.mrr * 12
                  : null,
            mrr_growth_rate_pct: state.mrr_growth_rate_pct,
            monthly_churn_pct: state.monthly_churn_pct,
            cac: state.cac,
            ltv: state.ltv,
            burn_rate_monthly: state.burn_rate_monthly,
            runway_months: state.runway_months,
            team_size: state.team_size,
            active_users: state.active_users,
            year5_revenue_projection: state.year5_revenue_projection,
            exit_revenue_multiple: state.exit_revenue_multiple,
            exit_revenue_multiple_rationale: state.exit_revenue_multiple_rationale,
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
          // wasteful round-trip with the same outcome.  When the pedigree
          // object IS sent, also send the evidence dict (even if empty)
          // so the engine's evidence gate has something to evaluate
          // against — this is the contract that prevents silent multiplier
          // collapse when the founder ticks a claim without evidence.
          ...(Object.values(state.founder_pedigree).some(Boolean)
            ? {
                founder_pedigree: {
                  ...state.founder_pedigree,
                  pedigree_evidence: pedigreeEvidenceForPayload(state.pedigree_evidence),
                },
              }
            : {}),
          ...(Object.keys(studioMetadata).length > 0 ? { studio_v2: studioMetadata } : {}),
        }
      },
    }),
    {
      name: 'venus.startup_valuation.v1',
      version: 9,
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
      //   v7 → v8: re-sanitize `pedigree_evidence` (known keys, max length)
      //            so corrupted or pre-hardening persisted blobs can't
      //            bloat localStorage or resurrect junk keys.
      //   v8 → v9: normalize `cap_table.pre_money_target` (positive EUR,
      //            capped) so legacy / malformed localStorage cannot
      //            persist 0 or negative “pre-money” targets.
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
          // ``tam_sam_som`` was removed 2026-05-08; we silently drop
          // any legacy persisted value so older localStorage shapes
          // hydrate cleanly into the trimmed state.
          if ('tam_sam_som' in s) delete s.tam_sam_som
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
        if (version < 7) {
          // April 2026 hardening: pedigree_evidence dict carries the
          // per-claim evidence string the engine's evidence gate now
          // requires.  Default to empty so the multiplier stays at 1.0
          // for previously-persisted founders until they revisit the
          // FounderPedigreeStep and add evidence (or un-tick the
          // unevidenced claim).  Preserves the old behaviour: positive
          // claims that were getting the lift before now get neutralised
          // — matches the consortium-spec reviewer's recommendation
          // ("default 1.00× without evidence").
          if (!s.pedigree_evidence) {
            s.pedigree_evidence = {}
          }
        }
        if (version < 8) {
          // Align persisted blobs with the same contract as the API:
          // only canonical keys, bounded length, no junk from legacy data.
          if (s.pedigree_evidence && typeof s.pedigree_evidence === 'object') {
            s.pedigree_evidence = sanitizePedigreeEvidenceMap(
              s.pedigree_evidence as Record<string, unknown>
            )
          }
        }
        if (version < 9) {
          if (s.cap_table && typeof s.cap_table === 'object') {
            const ct = s.cap_table as StartupCapTableState
            s.cap_table = {
              ...ct,
              pre_money_target: normalizePreMoneyTarget(ct.pre_money_target),
            }
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
          setPedigreeEvidence,
          applyPreset,
          setEvidenceNote,
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
        void setPedigreeEvidence
        void applyPreset
        void setEvidenceNote
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
