import type { StoreApi } from 'zustand'
import { normalizePreMoneyTarget } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import { inferStartupSectorFromNace } from './inferStartupSectorFromNace'
import { inferStartupStageFromFoundingYear } from './inferStartupStageFromFoundingYear'
import {
  MATURITY_TO_SCORE,
  type MaturityLevel,
  PEDIGREE_EVIDENCE_MAX_LEN,
  type StartupCapTableState,
  type StartupValuationState,
  type StudioMilestoneKey,
} from './startupValuationDomain'
import { INITIAL_STARTUP_VALUATION_STATE } from './startupValuationInitialState'
import { buildStartupValuationPayload } from './startupValuationPayload'
import { applyStartupValuationSnapshot } from './startupValuationSnapshot'
import type { StartupValuationActions, StartupValuationStore } from './startupValuationStoreTypes'

type StartupValuationSet = StoreApi<StartupValuationStore>['setState']
type StartupValuationGet = StoreApi<StartupValuationStore>['getState']

function generateSafeNoteId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `safe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export function createStartupValuationActions(
  set: StartupValuationSet,
  get: StartupValuationGet
): StartupValuationActions {
  return {
    setField: (key, value) =>
      set((state) => {
        const next: StartupValuationState = { ...state, [key]: value }
        if (key === 'sector') next._sectorWasUserSet = true
        if (key === 'stage') next._stageWasUserSet = true
        return next
      }),

    setMaturity: (key, level) =>
      set(
        (state) =>
          ({
            ...state,
            maturity: { ...state.maturity, [key]: level },
            [key]: MATURITY_TO_SCORE[level],
          }) as Partial<StartupValuationStore>
      ),

    setPedigreeFlag: (key, applied) =>
      set((state) => {
        const next = { ...state.founder_pedigree, [key]: applied }
        if (applied && key === 'solo_founder') next.has_technical_cofounder = false
        if (applied && key === 'has_technical_cofounder') next.solo_founder = false

        let evidence = state.pedigree_evidence
        if (!applied && key !== 'solo_founder') {
          const { [key]: _removed, ...rest } = state.pedigree_evidence
          evidence = rest
        }
        return { founder_pedigree: next, pedigree_evidence: evidence }
      }),

    setPedigreeEvidence: (key, evidence) =>
      set((state) => {
        if (!evidence.trim()) {
          const { [key]: _removed, ...rest } = state.pedigree_evidence
          return { pedigree_evidence: rest }
        }
        const capped =
          evidence.length > PEDIGREE_EVIDENCE_MAX_LEN
            ? evidence.slice(0, PEDIGREE_EVIDENCE_MAX_LEN)
            : evidence
        return {
          pedigree_evidence: { ...state.pedigree_evidence, [key]: capped },
        }
      }),

    applyPreset: (preset) => {
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
        evidence_notes: { ...state.evidence_notes, [key]: note },
      })),

    seedSectorFromNaceIfDefault: (nace) =>
      set((state) => {
        if (state._sectorWasUserSet) return state
        const inferred = inferStartupSectorFromNace(nace)
        if (!inferred || inferred === state.sector) return state
        return { sector: inferred }
      }),

    seedStageFromFoundingYearIfDefault: (year) =>
      set((state) => {
        if (state._stageWasUserSet) return state
        const inferred = inferStartupStageFromFoundingYear({ foundingYear: year })
        if (!inferred || inferred === state.stage) return state
        return { stage: inferred }
      }),

    setCapField: <K extends keyof StartupCapTableState>(key: K, value: StartupCapTableState[K]) =>
      set((state) => ({
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
        cap_table: {
          ...state.cap_table,
          safe_notes: state.cap_table.safe_notes.map((note) =>
            note.id === id ? { ...note, ...patch } : note
          ),
        },
      })),

    removeSafeNote: (id) =>
      set((state) => ({
        cap_table: {
          ...state.cap_table,
          safe_notes: state.cap_table.safe_notes.filter((note) => note.id !== id),
        },
      })),

    reset: () => set(() => ({ ...INITIAL_STARTUP_VALUATION_STATE })),

    applyFromSnapshot: (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') return
      set((state) => applyStartupValuationSnapshot(state, snapshot as Record<string, unknown>))
    },

    toRequestPayload: () => buildStartupValuationPayload(get()),
  }
}
