import { describe, expect, it } from 'vitest'
import { deriveMarkSavedState, deriveMarkUnsavedState } from './useSessionStore.dirtyState'

describe('session dirty state transitions', () => {
  it('clears unsaved state when the saved dirty version is current', () => {
    const savedAt = new Date('2026-06-20T10:00:00.000Z')

    expect(
      deriveMarkSavedState(
        {
          dirtyVersion: 3,
          errorMessage: 'previous save failed',
          hasUnsavedChanges: true,
          isSaving: true,
          lastSaved: null,
        },
        3,
        savedAt
      )
    ).toEqual({
      dirtyVersion: 3,
      errorMessage: null,
      hasUnsavedChanges: false,
      isSaving: false,
      lastSaved: savedAt,
    })
  })

  it('preserves unsaved state when newer local changes arrived during save', () => {
    const savedAt = new Date('2026-06-20T10:00:00.000Z')

    expect(
      deriveMarkSavedState(
        {
          dirtyVersion: 4,
          errorMessage: 'previous save failed',
          hasUnsavedChanges: true,
          isSaving: true,
          lastSaved: null,
        },
        3,
        savedAt
      )
    ).toEqual({
      dirtyVersion: 4,
      errorMessage: null,
      hasUnsavedChanges: true,
      isSaving: false,
      lastSaved: savedAt,
    })
  })

  it('increments dirty version when marking unsaved', () => {
    expect(deriveMarkUnsavedState({ dirtyVersion: 7 })).toEqual({
      dirtyVersion: 8,
      hasUnsavedChanges: true,
    })
  })
})
