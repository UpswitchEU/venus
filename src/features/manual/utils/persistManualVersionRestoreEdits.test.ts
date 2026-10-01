import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISessionEngine } from '../../../services/session/SessionEngine'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import type { ValuationSession } from '../../../types/valuation'
import { persistManualVersionRestoreEdits } from './persistManualVersionRestoreEdits'

const flushForm = vi.fn<() => Promise<void>>()
const saveSession = vi.fn<() => Promise<void>>()
const updateSessionData = vi.fn<() => Promise<void>>()
const markUnsaved = vi.fn(() => useSessionStore.setState({ hasUnsavedChanges: true }))
const run = (isCurrent = () => true) => persistManualVersionRestoreEdits({ flushForm, isCurrent })

beforeEach(() => {
  vi.clearAllMocks()
  flushForm.mockResolvedValue(undefined)
  updateSessionData.mockResolvedValue(undefined)
  saveSession.mockImplementation(async () => {
    useSessionStore.setState({ hasUnsavedChanges: false })
  })
  useSessionStore.setState({
    engine: {} as ISessionEngine,
    engineRevision: 1,
    session: { reportId: 'report-1', sessionData: {} } as ValuationSession,
    hasUnsavedChanges: false,
    isSaving: false,
    saveErrorMessage: null,
    saveSession,
    updateSessionData,
    markUnsaved,
  })
  useNormalizationStore.setState({ items: [] })
  useTaxLatencyStore.setState({ items: [], candidates: [] })
})

describe('persist inputs preserved across a committed restore', () => {
  it('forces a fresh draft acknowledgement even when the inputs were saved before restoration', async () => {
    await run()
    expect(markUnsaved).toHaveBeenCalledOnce()
    expect(flushForm).toHaveBeenCalledOnce()
    expect(updateSessionData).toHaveBeenCalledWith({
      _normalizations: [],
      _taxLatencies: [],
      tax_latencies: [],
    })
    expect(saveSession).toHaveBeenCalledWith('user')
    expect(markUnsaved.mock.invocationCallOrder[0]).toBeLessThan(
      flushForm.mock.invocationCallOrder[0]
    )
    expect(flushForm.mock.invocationCallOrder[0]).toBeLessThan(
      updateSessionData.mock.invocationCallOrder[0]
    )
    expect(updateSessionData.mock.invocationCallOrder[0]).toBeLessThan(
      saveSession.mock.invocationCallOrder[0]
    )
  })

  it('keeps unsaved status after a form flush fails', async () => {
    flushForm.mockRejectedValueOnce(new Error('Offline'))
    await expect(run()).rejects.toThrow('Offline')
    expect(saveSession).not.toHaveBeenCalled()
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('does not save after switching workspaces during the form flush', async () => {
    flushForm.mockImplementationOnce(async () => {
      useSessionStore.setState({ engineRevision: 2 })
    })
    await expect(run()).rejects.toThrow('workspace changed')
    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('keeps newer edits dirty when saving adjustments fails after a successful form flush', async () => {
    flushForm.mockImplementationOnce(async () => {
      useSessionStore.setState({ hasUnsavedChanges: false })
    })
    updateSessionData.mockRejectedValueOnce(new Error('Offline'))
    await expect(run()).rejects.toThrow('Offline')
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('does not persist when access has changed', async () => {
    await expect(run(() => false)).rejects.toThrow('workspace changed')
    expect(flushForm).not.toHaveBeenCalled()
  })

  it('does not treat a resolved save error as confirmation', async () => {
    saveSession.mockImplementationOnce(async () =>
      useSessionStore.setState({ hasUnsavedChanges: false, saveErrorMessage: 'Offline' })
    )
    await expect(run()).rejects.toThrow('not yet confirmed')
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('does not claim newer edits made during the final write are saved', async () => {
    saveSession.mockImplementationOnce(async () => {
      useManualFormStore.setState({
        formData: { ...useManualFormStore.getState().formData, company_name: 'Latest edit' },
      })
      useSessionStore.setState({ hasUnsavedChanges: false })
    })
    await expect(run()).rejects.toThrow('not yet confirmed')
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
  })
})
