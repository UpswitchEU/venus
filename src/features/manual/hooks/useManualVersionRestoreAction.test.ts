import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionAPI } from '../../../services/api/version/VersionAPI'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import { useManualVersionRestoreAction } from './useManualVersionRestoreAction'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const html = `<html><body>${'Restored report '.repeat(20)}</body></html>`
const source = {
  versionNumber: 1,
  formData: { company_name: 'Original' },
  valuationResult: { equity_value_mid: 100, html_report: html },
}
const committed = { ...source, id: 'v4', versionNumber: 4 }
const params = () => ({
  reportId: 'report-a',
  normalizationActions: { setItems: vi.fn() },
  setResult: vi.fn(),
  setRightPanelView: vi.fn(),
  translate: (key: string) => key,
  updateFormData: vi.fn(),
})

describe('manual version restoration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
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
    await act(async () => {
      resolve(committed)
      await Promise.all([first, second])
    })
    expect(p.setResult).toHaveBeenCalledWith(expect.objectContaining({ equity_value_mid: 100 }))
    expect(p.normalizationActions.setItems).toHaveBeenCalledWith([])
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(4)
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it('does not hand a restore of another version the first restore\u2019s promise', async () => {
    let resolveFirst!: (value: any) => void
    const restore = vi
      .spyOn(VersionAPI.prototype, 'restoreVersion')
      .mockImplementation((_id, versionNumber) =>
        versionNumber === 1
          ? new Promise((done) => {
              resolveFirst = done
            })
          : Promise.resolve({ ...committed, id: 'v2', versionNumber: 2 } as any)
      )
    const p = params()
    const { result } = renderHook(() => useManualVersionRestoreAction(p))
    const first = result.current.handleVersionRestore(source)
    const second = result.current.handleVersionRestore({ ...source, versionNumber: 2 })
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(2))
    expect(restore.mock.calls.map((call) => call[1])).toEqual([1, 2])
    await act(async () => {
      resolveFirst(committed)
      await Promise.all([first, second])
    })
    expect(toast.success).toHaveBeenCalledTimes(2)
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
})
