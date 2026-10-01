import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionAPI } from '../../../services/api/version/VersionAPI'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import { persistManualVersionRestoreEdits } from '../utils/persistManualVersionRestoreEdits'
import { useManualVersionRestoreAction } from './useManualVersionRestoreAction'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('../utils/persistManualVersionRestoreEdits', () => ({
  persistManualVersionRestoreEdits: vi.fn(),
}))
const html = `<html><body>${'Restored report '.repeat(20)}</body></html>`
const source = {
  versionNumber: 1,
  formData: { company_name: 'Original' },
  valuationResult: { equity_value_mid: 100, html_report: html },
}
const committed = { ...source, id: 'v4', versionNumber: 4 }
const params = () => ({
  reportId: 'report-a',
  restoreInFlightRef: { current: false },
  flushFormAfterRestore: vi.fn().mockResolvedValue(undefined),
  normalizationActions: { setItems: vi.fn() },
  setResult: vi.fn(),
  setRightPanelView: vi.fn(),
  translate: (key: string) => key,
  updateFormData: vi.fn(),
})

describe('manual version restoration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(persistManualVersionRestoreEdits).mockReset().mockResolvedValue(undefined)
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.info).mockClear()
    useNormalizationStore.setState({ items: [] })
    useTaxLatencyStore.setState({ items: [], candidates: [] })
    useSessionStore.setState({ engine: null, engineRevision: 1 })
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    vi.spyOn(useVersionHistoryStore.getState(), 'fetchVersions').mockResolvedValue(undefined)
  })

  it('waits for one committed restore and selects the new version number', async () => {
    let resolve!: (value: any) => void
    const restore = vi.spyOn(VersionAPI.prototype, 'restoreVersion').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    const first = result.current.handleVersionRestore(source)
    const second = result.current.handleVersionRestore(source)
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1))
    expect(p.setResult).not.toHaveBeenCalled()
    expect(p.updateFormData).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(p.restoreInFlightRef.current).toBe(true)
    await act(async () => {
      resolve(committed)
      await Promise.all([first, second])
    })
    expect(p.setResult).toHaveBeenCalledWith(expect.objectContaining({ equity_value_mid: 100 }))
    expect(p.normalizationActions.setItems).toHaveBeenCalledWith([])
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(4)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(p.restoreInFlightRef.current).toBe(false)
  })

  it('blocks a different restore until the first commit settles, then accepts it', async () => {
    let resolveFirst!: (value: any) => void
    const restore = vi
      .spyOn(VersionAPI.prototype, 'restoreVersion')
      .mockImplementation((_id, versionNumber) =>
        versionNumber === 1
          ? new Promise((done) => {
              resolveFirst = done
            })
          : Promise.resolve({ ...committed, id: 'v5', versionNumber: 5 } as any)
      )
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    const first = result.current.handleVersionRestore(source)
    await result.current.handleVersionRestore({ ...source, versionNumber: 2 })
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1))
    expect(toast.info).toHaveBeenCalledWith('versionRestoreInProgress')
    expect(p.restoreInFlightRef.current).toBe(true)
    await act(async () => {
      resolveFirst(committed)
      await first
    })
    await act(async () => {
      await result.current.handleVersionRestore({ ...source, versionNumber: 2 })
    })
    expect(restore.mock.calls.map((call) => call[1])).toEqual([1, 2])
    expect(toast.success).toHaveBeenCalledTimes(2)
    expect(p.restoreInFlightRef.current).toBe(false)
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(5)
  })

  it('keeps the current report on failure and reuses the same operation identifier on retry', async () => {
    const restore = vi
      .spyOn(VersionAPI.prototype, 'restoreVersion')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(committed as any)
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    await act(async () => {
      await result.current.handleVersionRestore(source)
    })
    expect(p.setResult).not.toHaveBeenCalled()
    expect(p.updateFormData).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
    await act(async () => {
      await result.current.handleVersionRestore(source)
    })
    expect(restore.mock.calls[1][2]?.idempotencyKey).toBe(restore.mock.calls[0][2]?.idempotencyKey)
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it.each([
    'report switch',
    'client switch',
    'unmount',
    'session engine replacement',
  ])('ignores a late restore after %s', async (transition) => {
    let resolve!: (value: any) => void
    const restore = vi.spyOn(VersionAPI.prototype, 'restoreVersion').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const p = params()
    const { result, rerender, unmount } = renderHook(
      (props) => useManualVersionRestoreAction(props),
      { initialProps: p }
    )
    const restoring = result.current.handleVersionRestore(source)
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1))
    if (transition === 'report switch') rerender({ ...p, reportId: 'report-b' })
    else if (transition === 'client switch')
      useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    else if (transition === 'session engine replacement')
      useSessionStore.setState({ engineRevision: 2 })
    else unmount()
    await act(async () => {
      resolve(committed)
      await restoring
    })
    expect(p.setResult).not.toHaveBeenCalled()
    expect(p.updateFormData).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('preserves new form edits made while restoration is pending', async () => {
    let resolve!: (value: any) => void
    const restore = vi.spyOn(VersionAPI.prototype, 'restoreVersion').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    const restoring = result.current.handleVersionRestore(source)
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1))
    useManualFormStore.setState({
      formData: { ...useManualFormStore.getState().formData, company_name: 'New advisor edit' },
    })
    await act(async () => {
      resolve(committed)
      await restoring
    })
    expect(p.updateFormData).not.toHaveBeenCalled()
    expect(p.normalizationActions.setItems).not.toHaveBeenCalled()
    expect(useManualFormStore.getState().formData.company_name).toBe('New advisor edit')
  })
  it.each([
    'normalizations',
    'tax items',
    'tax candidates',
  ])('preserves the full input snapshot after newer %s arrive', async (changed) => {
    let finish!: (value: any) => void
    const restore = vi.spyOn(VersionAPI.prototype, 'restoreVersion').mockImplementation(
      () =>
        new Promise((done) => {
          finish = done
        })
    )
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    const restoring = result.current.handleVersionRestore(source)
    await waitFor(() => expect(restore).toHaveBeenCalledOnce())
    if (changed === 'normalizations')
      useNormalizationStore.setState({ items: [{ id: 'newer', amount: 12000 } as any] })
    if (changed === 'tax items')
      useTaxLatencyStore.setState({ items: [{ id: 'newer', temporaryDifference: 9000 } as any] })
    if (changed === 'tax candidates')
      useTaxLatencyStore.setState({ candidates: [{ id: 'newer' } as any] })
    const taxItems = useTaxLatencyStore.getState().items
    const candidates = useTaxLatencyStore.getState().candidates
    await act(async () => {
      finish(committed)
      await restoring
    })
    expect(p.updateFormData).not.toHaveBeenCalled()
    expect(p.normalizationActions.setItems).not.toHaveBeenCalled()
    expect(useTaxLatencyStore.getState().items).toBe(taxItems)
    expect(useTaxLatencyStore.getState().candidates).toBe(candidates)
    expect(toast.success).toHaveBeenCalledWith(
      'versionRestored',
      expect.objectContaining({ description: 'versionRestoreEditsKept' })
    )
  })

  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    true,
  ])('does not request an invalid version: %s', async (versionNumber) => {
    const restore = vi.spyOn(VersionAPI.prototype, 'restoreVersion')
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    await result.current.handleVersionRestore({ ...source, versionNumber })
    expect(restore).not.toHaveBeenCalled()
    expect(p.restoreInFlightRef.current).toBe(false)
  })

  it('keeps the current inputs and retry identifier when a restore acknowledgement is invalid', async () => {
    const restore = vi
      .spyOn(VersionAPI.prototype, 'restoreVersion')
      .mockResolvedValueOnce({ ...committed, versionNumber: 0 } as any)
      .mockResolvedValueOnce(committed as any)
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    await act(async () => {
      await result.current.handleVersionRestore(source)
    })
    expect(p.updateFormData).not.toHaveBeenCalled()
    expect(p.setResult).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(p.restoreInFlightRef.current).toBe(false)
    await act(async () => {
      await result.current.handleVersionRestore(source)
    })
    expect(restore.mock.calls[1][2]?.idempotencyKey).toBe(restore.mock.calls[0][2]?.idempotencyKey)
  })
  it('retries only the newer draft after its save fails, without restoring another version', async () => {
    let finish!: (value: any) => void
    const restore = vi.spyOn(VersionAPI.prototype, 'restoreVersion').mockImplementation(
      () =>
        new Promise((done) => {
          finish = done
        })
    )
    vi.mocked(persistManualVersionRestoreEdits)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(undefined)
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    const restoring = result.current.handleVersionRestore(source)
    await waitFor(() => expect(restore).toHaveBeenCalledOnce())
    useManualFormStore.setState({
      formData: { ...useManualFormStore.getState().formData, company_name: 'New edit' },
    })
    await act(async () => {
      finish(committed)
      await restoring
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      'versionRestoreEditsSaveFailed',
      expect.objectContaining({ duration: Infinity })
    )
    const options = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
    const retry = options?.action as { onClick: () => void }
    await act(async () => {
      retry.onClick()
    })
    expect(persistManualVersionRestoreEdits).toHaveBeenCalledTimes(2)
    expect(restore).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'versionRestored',
      expect.objectContaining({ description: 'versionRestoreEditsKept' })
    )
  })
})
