import type { StudioPreset } from '@/features/startup-studio/data/presets'
import type {
  FounderPedigreeKey,
  MaturityLevel,
  StartupCapTableState,
  StartupSafeNote,
  StartupValuationState,
  StudioMilestoneKey,
} from './startupValuationDomain'

export interface StartupValuationStore extends StartupValuationState {
  setField: <K extends keyof StartupValuationState>(key: K, value: StartupValuationState[K]) => void
  setCapField: <K extends keyof StartupCapTableState>(
    key: K,
    value: StartupCapTableState[K]
  ) => void
  setMaturity: (key: StudioMilestoneKey, level: MaturityLevel) => void
  applyPreset: (preset: StudioPreset) => void
  setPedigreeFlag: (key: FounderPedigreeKey, applied: boolean) => void
  setPedigreeEvidence: (key: Exclude<FounderPedigreeKey, 'solo_founder'>, evidence: string) => void
  setEvidenceNote: (key: StudioMilestoneKey, note: string) => void
  addSafeNote: () => void
  updateSafeNote: (id: string, patch: Partial<StartupSafeNote>) => void
  removeSafeNote: (id: string) => void
  seedSectorFromNaceIfDefault: (nace: string | null | undefined) => void
  seedStageFromFoundingYearIfDefault: (year: number | null | undefined) => void
  reset: () => void
  toRequestPayload: () => Record<string, unknown>
  applyFromSnapshot: (snapshot: Record<string, unknown> | null | undefined) => void
}

export type StartupValuationActions = Omit<StartupValuationStore, keyof StartupValuationState>
