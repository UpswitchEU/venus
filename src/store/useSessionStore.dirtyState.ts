import type { PersistenceFailure } from '../utils/persistenceOutcome'
export interface SessionDirtyState {
  dirtyVersion: number
  errorMessage: string | null
  saveErrorMessage?: string | null
  saveFailure?: PersistenceFailure | null
  hasUnsavedChanges: boolean
  isSaving: boolean
  lastSaved: Date | null
}

export function deriveMarkSavedState(
  current: SessionDirtyState,
  expectedDirtyVersion?: number,
  now: Date = new Date()
): SessionDirtyState {
  const hasNewerChanges =
    expectedDirtyVersion !== undefined && current.dirtyVersion !== expectedDirtyVersion

  return {
    ...current,
    hasUnsavedChanges: hasNewerChanges ? current.hasUnsavedChanges : false,
    lastSaved: now,
    ...(current.saveFailure !== undefined
      ? { saveFailure: hasNewerChanges ? current.saveFailure : null }
      : {}),
    isSaving: false,
    errorMessage: hasNewerChanges ? current.errorMessage : null,
    ...(current.saveErrorMessage !== undefined
      ? { saveErrorMessage: hasNewerChanges ? current.saveErrorMessage : null }
      : {}),
  }
}

export function deriveMarkUnsavedState(current: Pick<SessionDirtyState, 'dirtyVersion'>): {
  dirtyVersion: number
  hasUnsavedChanges: true
} {
  return {
    hasUnsavedChanges: true,
    dirtyVersion: current.dirtyVersion + 1,
  }
}
