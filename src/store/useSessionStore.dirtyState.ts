export interface SessionDirtyState {
  dirtyVersion: number
  errorMessage: string | null
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
    isSaving: false,
    errorMessage: null,
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
