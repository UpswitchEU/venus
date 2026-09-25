import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualReportUiState } from './useManualReportUiState'

const session = vi.hoisted(() => ({
  isSaving: false,
  hasUnsavedChanges: false,
  saveErrorMessage: null as string | null,
  lastSaved: null as Date | null,
}))
vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: (select: (state: typeof session) => unknown) => select(session),
}))

beforeEach(() => {
  Object.assign(session, {
    isSaving: false,
    hasUnsavedChanges: false,
    saveErrorMessage: null,
    lastSaved: null,
  })
})

describe('manual report persistence indicator', () => {
  it('a failed autosave overrides an earlier successful calculation save and says so', () => {
    const { result, rerender } = renderHook(() => useManualReportUiState({ initialTab: 'preview' }))
    act(() => result.current.setDraftStatus('saved'))
    session.saveErrorMessage = 'Network error'
    rerender()
    // A failed save is not a harmless draft: the context bar reads "Not saved".
    expect(result.current.draftStatus).toBe('unsaved')
  })

  it('new unsaved edits override an earlier successful calculation save', () => {
    const { result, rerender } = renderHook(() => useManualReportUiState({ initialTab: 'preview' }))
    act(() => result.current.setDraftStatus('saved'))
    session.hasUnsavedChanges = true
    rerender()
    expect(result.current.draftStatus).toBe('draft')
  })

  it('shows in-flight session persistence and the actual acknowledgement time', () => {
    session.isSaving = true
    const { result, rerender } = renderHook(() => useManualReportUiState({ initialTab: 'preview' }))
    expect(result.current.draftStatus).toBe('saving')
    session.isSaving = false
    session.lastSaved = new Date('2026-09-19T06:12:51Z')
    rerender()
    expect(result.current.draftStatus).toBe('saved')
    expect(result.current.lastSaved).toEqual(session.lastSaved)
  })
})
