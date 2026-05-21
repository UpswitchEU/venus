import type { StartupValuationSet } from './startupValuationActionTypes'
import { PEDIGREE_EVIDENCE_MAX_LEN } from './startupValuationDomain'
import type { StartupValuationActions } from './startupValuationStoreTypes'

type StartupValuationPedigreeActions = Pick<
  StartupValuationActions,
  'setPedigreeFlag' | 'setPedigreeEvidence'
>

export function createStartupValuationPedigreeActions(
  set: StartupValuationSet
): StartupValuationPedigreeActions {
  return {
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
  }
}
