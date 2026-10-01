import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualReportUiState } from './useManualReportUiState'

const resultSave = vi.hoisted(() => ({ failure: undefined as { error: string } | undefined }))
vi.mock('../../../hooks/useReportAssetSaveFailure', () => ({
  useReportAssetSaveFailure: () => resultSave.failure,
}))

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
  resultSave.failure = undefined
  Object.assign(session, {
    isSaving: false,
    hasUnsavedChanges: false,
    saveErrorMessage: null,
    lastSaved: null,
  })
})

describe('manual report persistence indicator', () => {
  it('keeps a failed result save visible even when draft autosave succeeds', () => {
    session.lastSaved = new Date('2026-09-19T06:00:00Z')
    const { result, rerender } = renderHook(() => useManualReportUiState({ initialTab: 'preview' }))
    resultSave.failure = { error: 'result save failed' }
    rerender()
    expect(result.current.draftStatus).toBe('unsaved')
    session.isSaving = true
    rerender()
    expect(result.current.draftStatus).toBe('unsaved')
    session.isSaving = false
    session.lastSaved = new Date('2026-09-19T06:05:00Z')
    rerender()
    expect(result.current.draftStatus).toBe('unsaved')
    act(() => result.current.setDraftStatus('saving'))
    expect(result.current.draftStatus).toBe('unsaved')
    act(() => result.current.setDraftStatus('draft'))
    // Recovery from another save surface clears the service failure too.
    resultSave.failure = undefined
    rerender()
    expect(result.current.draftStatus).toBe('saved')
  })

  it('uses the latest acknowledgement time across draft and result saves', () => {
    session.lastSaved = new Date('2026-09-19T06:00:00Z')
    const { result, rerender } = renderHook(() => useManualReportUiState({ initialTab: 'preview' }))
    const resultSavedAt = new Date('2026-09-19T06:05:00Z')
    act(() => result.current.setLastSaved(resultSavedAt))
    expect(result.current.lastSaved).toEqual(resultSavedAt)
    session.lastSaved = new Date('2026-09-19T06:10:00Z')
    rerender()
    expect(result.current.lastSaved).toEqual(session.lastSaved)
  })

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
