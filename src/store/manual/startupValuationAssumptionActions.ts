import type { StartupValuationGet, StartupValuationSet } from './startupValuationActionTypes'
import {
  MATURITY_TO_SCORE,
  type MaturityLevel,
  type StartupValuationState,
  type StudioMilestoneKey,
} from './startupValuationDomain'
import type { StartupValuationActions, StartupValuationStore } from './startupValuationStoreTypes'

type StartupValuationAssumptionActions = Pick<
  StartupValuationActions,
  'setField' | 'setMaturity' | 'applyPreset' | 'setEvidenceNote'
>

export function createStartupValuationAssumptionActions(
  set: StartupValuationSet,
  get: StartupValuationGet
): StartupValuationAssumptionActions {
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
  }
}
