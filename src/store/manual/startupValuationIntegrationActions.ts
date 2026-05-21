import { inferStartupSectorFromNace } from './inferStartupSectorFromNace'
import { inferStartupStageFromFoundingYear } from './inferStartupStageFromFoundingYear'
import type { StartupValuationGet, StartupValuationSet } from './startupValuationActionTypes'
import { INITIAL_STARTUP_VALUATION_STATE } from './startupValuationInitialState'
import { buildStartupValuationPayload } from './startupValuationPayload'
import { applyStartupValuationSnapshot } from './startupValuationSnapshot'
import type { StartupValuationActions } from './startupValuationStoreTypes'

type StartupValuationIntegrationActions = Pick<
  StartupValuationActions,
  | 'seedSectorFromNaceIfDefault'
  | 'seedStageFromFoundingYearIfDefault'
  | 'reset'
  | 'applyFromSnapshot'
  | 'toRequestPayload'
>

export function createStartupValuationIntegrationActions(
  set: StartupValuationSet,
  get: StartupValuationGet
): StartupValuationIntegrationActions {
  return {
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

    reset: () => set(() => ({ ...INITIAL_STARTUP_VALUATION_STATE })),

    applyFromSnapshot: (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') return
      set((state) => applyStartupValuationSnapshot(state, snapshot as Record<string, unknown>))
    },

    toRequestPayload: () => buildStartupValuationPayload(get()),
  }
}
