/**
 * Manual Flow - Startup Valuation Store
 *
 * Thin Zustand shell for the venture-path valuation state. Domain contracts,
 * defaults, persistence migration, and mutations live in sibling modules so
 * this file stays useful as the ownership map instead of becoming the system.
 *
 * Mirrors `apps/titan-api/src/valuations/dto/valuation-request.dto.ts`
 * (`startupInputsSchema`) and `apps/valuation-iq/src/domain/startup_valuation/schemas.py`.
 *
 * @module store/manual/useStartupValuationStore
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createStartupValuationActions } from './startupValuationActions'
import { INITIAL_STARTUP_VALUATION_STATE } from './startupValuationInitialState'
import {
  migrateStartupValuationState,
  partializeStartupValuationState,
  STARTUP_VALUATION_PERSIST_NAME,
  STARTUP_VALUATION_PERSIST_VERSION,
} from './startupValuationPersistence'
import type { StartupValuationStore } from './startupValuationStoreTypes'

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

export const useStartupValuationStore = create<StartupValuationStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STARTUP_VALUATION_STATE,
      ...createStartupValuationActions(set, get),
    }),
    {
      name: STARTUP_VALUATION_PERSIST_NAME,
      version: STARTUP_VALUATION_PERSIST_VERSION,
      migrate: migrateStartupValuationState,
      partialize: partializeStartupValuationState,
    }
  )
)
