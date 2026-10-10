import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferReportRecovery, useReportRecoveryStore } from '../../../store/reportRecoveryStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useReportRecovery } from './useReportRecovery'

vi.mock('../../../services', () => ({
  reportAssetService: { retryFailedSave: vi.fn().mockResolvedValue(false) },
}))
vi.mock('../../../hooks/useReportAssetSaveFailure', () => ({
  useReportAssetSaveFailure: () => undefined,
}))
const temporary = {
  kind: 'temporary' as const,
  status: 503,
  message: 'Unable to verify your firm subscription',
}
const original = useSessionStore.getState()
const originalNorm = useNormalizationStore.getState()
const save = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  save.mockReset().mockResolvedValue({ status: 'deferred', failure: temporary })
  useSessionStore.setState({
    session: { reportId: 'report-123' } as never,
    saveSession: save,
    saveFailure: temporary,
    isSaving: false,
    hasUnsavedChanges: true,
  })
  useNormalizationStore.setState({
    pendingMutations: [],
    recoveryBuffered: false,
    isSaving: false,
    retryPersist: vi.fn().mockResolvedValue({ status: 'acknowledged' }),
  })
  useReportRecoveryStore.setState({ step: null })
})
afterEach(() => {
  useSessionStore.setState(original, true)
  useNormalizationStore.setState(originalNorm, true)
  useReportRecoveryStore.setState({ step: null })
  vi.useRealTimers()
})
describe('one report recovery coordinator', () => {
  it('tries after 8/16/32 seconds, then remains manually actionable', async () => {
    const h = renderHook(() => useReportRecovery('report-123'))
    expect(h.result.current.scheduled).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000)
    })
    expect(save).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32000)
    })
    expect(save).toHaveBeenCalledTimes(3)
    expect(h.result.current.scheduled).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000)
    })
    expect(save).toHaveBeenCalledTimes(3)
    await act(async () => {
      await h.result.current.retry()
    })
    expect(save).toHaveBeenCalledTimes(4)
    h.unmount()
  })
  it('honours Retry-After and cancels an obsolete report timer', async () => {
    useSessionStore.setState({ saveFailure: { ...temporary, retryAfterMs: 30000 } })
    const h = renderHook(() => useReportRecovery('report-123'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29999)
    })
    expect(save).not.toHaveBeenCalled()
    h.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(save).not.toHaveBeenCalled()
  })
  it('synchronizes a restored buffer even when no Titan year mutations remain', async () => {
    useSessionStore.setState({ saveFailure: null, hasUnsavedChanges: false })
    const persist = vi.fn().mockImplementation(async () => {
      useNormalizationStore.setState({ recoveryBuffered: false })
      return { status: 'acknowledged' }
    })
    useNormalizationStore.setState({ recoveryBuffered: true, persistToSession: persist })
    const h = renderHook(() => useReportRecovery('report-123'))
    expect(h.result.current.blocked).toBe(true)
    await act(async () => {
      await h.result.current.retry()
    })
    expect(persist).toHaveBeenCalledWith('report-123')
    expect(h.result.current.blocked).toBe(false)
    h.unmount()
  })

  it('never treats a confirmed denial as an automatic service retry', async () => {
    useSessionStore.setState({
      saveFailure: {
        kind: 'subscription',
        status: 402,
        message: 'Subscription required',
        canManageBilling: true,
      },
    })
    const h = renderHook(() => useReportRecovery('report-123'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000)
    })
    expect(h.result.current.scheduled).toBe(false)
    expect(save).not.toHaveBeenCalled()
    h.unmount()
  })
  it('resumes the retained result only after input and adjustment acknowledgement', async () => {
    const resultSave = vi.fn().mockResolvedValue(undefined)
    deferReportRecovery('report-123', 'result', { status: 503 }, resultSave)
    const h = renderHook(() => useReportRecovery('report-123'))
    await act(async () => {
      await h.result.current.retry()
    })
    expect(resultSave).not.toHaveBeenCalled()
    save.mockImplementation(async () => {
      useSessionStore.setState({ saveFailure: null, hasUnsavedChanges: false })
      return { status: 'acknowledged' }
    })
    await act(async () => {
      await h.result.current.retry()
    })
    expect(resultSave).toHaveBeenCalledTimes(1)
    await act(async () => {
      await h.result.current.retry()
    })
    expect(resultSave).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})
