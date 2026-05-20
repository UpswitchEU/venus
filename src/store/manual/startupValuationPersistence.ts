import { normalizePreMoneyTarget } from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import {
  INITIAL_PEDIGREE,
  type MaturityLevel,
  STARTUP_STAGE_DEFAULT_RAISE,
  type StartupCapTableState,
  type StartupValuationState,
  sanitizePedigreeEvidenceMap,
  scoreToMaturity,
} from './startupValuationDomain'
import type { StartupValuationStore } from './startupValuationStoreTypes'

export const STARTUP_VALUATION_PERSIST_NAME = 'venus.startup_valuation.v1'
export const STARTUP_VALUATION_PERSIST_VERSION = 9

export function migrateStartupValuationState(
  persistedState: unknown,
  version: number
): StartupValuationState {
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
    if ('tam_sam_som' in s) delete s.tam_sam_som
  }
  if (version < 5 && !s.founder_pedigree) {
    s.founder_pedigree = { ...INITIAL_PEDIGREE }
  }
  if (version < 6 && !s.inception_lens) {
    s.inception_lens = 'milestones_driven'
  }
  if (version < 7 && !s.pedigree_evidence) {
    s.pedigree_evidence = {}
  }
  if (version < 8 && s.pedigree_evidence && typeof s.pedigree_evidence === 'object') {
    s.pedigree_evidence = sanitizePedigreeEvidenceMap(
      s.pedigree_evidence as Record<string, unknown>
    )
  }
  if (version < 9 && s.cap_table && typeof s.cap_table === 'object') {
    const capTable = s.cap_table as StartupCapTableState
    s.cap_table = {
      ...capTable,
      pre_money_target: normalizePreMoneyTarget(capTable.pre_money_target),
    }
  }

  return s as StartupValuationState
}

export function partializeStartupValuationState(
  state: StartupValuationStore
): StartupValuationState {
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
    seedStageFromFoundingYearIfDefault,
    reset,
    toRequestPayload,
    applyFromSnapshot,
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
  void seedStageFromFoundingYearIfDefault
  void reset
  void toRequestPayload
  void applyFromSnapshot

  return rest
}
