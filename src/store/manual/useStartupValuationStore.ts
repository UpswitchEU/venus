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
        }
      },
    }),
    {
      name: 'venus.startup_valuation.v1',
      version: 3,
      // Migration history:
      //   v1 → v2: added `_sectorWasUserSet` flag (NACE smart-default guard).
      //   v2 → v3: added `investment_amount_sought` (consortium-spec VC
      //            anchor + cap-table simulator).  Seeded with the
      //            Benelux seed-stage median so returning users see a
      //            credible cap-table simulator on first re-open
      //            instead of a blank field.
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
        return s as StartupValuationState
      },
      partialize: (state) => {
        const {
          setField,
          setCapField,
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
