import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type { ValuationFormData } from '../../types/valuation'
import { useFormSessionSync } from '../useFormSessionSync'

const gate = vi.hoisted(() => ({ until: 0 }))

vi.mock('../formSessionAutosaveDefer', () => ({
  getMercurySourceApp: () => undefined,
  getSessionAutosaveDeferRemainingMs: () => Math.max(0, gate.until - Date.now()),
  observeMercuryDelegatedRestoration: vi.fn(),
  MERCURY_DELEGATED_AUTOSAVE_DEFER_MS: 0,
}))

const formData = { company_name: 'Client A', revenue: 100000, ebitda: 20000 } as ValuationFormData
const updateSessionData = vi.fn().mockResolvedValue(undefined)
const saveSession = vi.fn().mockResolvedValue(undefined)
const setSession = (reportId: string, sessionData: Record<string, unknown> = {}) => {
  useSessionStore.setState({
    session: { reportId, sessionData, name: 'Custom title' } as never,
    restorationComplete: true,
    status: 'loaded',
    saveErrorMessage: null,
    hasUnsavedChanges: false,
    isSaving: false,
    updateSessionData,
    saveSession,
  })
}

describe('form autosave lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    gate.until = 0
    updateSessionData.mockReset().mockResolvedValue(undefined)
    saveSession.mockReset().mockResolvedValue(undefined)
    useTaxLatencyStore.setState({ items: [] })
    setSession('report-a')
  })
  afterEach(() => vi.useRealTimers())

  it('flushes the current form before the debounce timer fires', async () => {
    const { result } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await result.current()
    })
    expect(updateSessionData).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Client A' })
    )
    expect(saveSession).toHaveBeenCalledOnce()
  })

  it('confirms an already-persisted normalized patch without a duplicate write, and retries a failed save of that same patch', async () => {
    const { result } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await result.current()
    })
    const payload = updateSessionData.mock.calls[0][0]
    setSession('report-a', payload)
    updateSessionData.mockClear()
    saveSession.mockClear()
    await act(async () => {
      await result.current()
    })
    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
    useSessionStore.setState({ hasUnsavedChanges: true, saveErrorMessage: 'offline' })
    saveSession.mockImplementationOnce(async () => {
      useSessionStore.setState({ hasUnsavedChanges: false, saveErrorMessage: null })
    })
    await act(async () => {
      await result.current()
    })
    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).toHaveBeenCalledExactlyOnceWith('user')
  })

  it('waits for the newest edit when a previous autosave is still running', async () => {
    let finishFirst!: () => void, finishSecond!: () => void
    saveSession
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSecond = resolve
          })
      )
    const { result, rerender } = renderHook(useFormSessionSync, {
      initialProps: { reportId: 'report-a', formData },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    rerender({ reportId: 'report-a', formData: { ...formData, revenue: 250000 } })
    const done = vi.fn()
    const flush = result.current().then(done)
    await act(async () => {
      finishFirst()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(done).not.toHaveBeenCalled()
    expect(updateSessionData).toHaveBeenLastCalledWith(expect.objectContaining({ revenue: 250000 }))
    await act(async () => {
      finishSecond()
      await flush
    })
    expect(done).toHaveBeenCalledOnce()
  })

  it.each([
    'local-update',
    'server-save',
    'resolved-error',
  ])('does not confirm a %s failure', async (failure) => {
    if (failure === 'local-update') updateSessionData.mockRejectedValueOnce(new Error('offline'))
    if (failure === 'server-save') saveSession.mockRejectedValueOnce(new Error('offline'))
    if (failure === 'resolved-error')
      saveSession.mockImplementationOnce(async () => {
        useSessionStore.setState({ saveErrorMessage: 'offline' })
      })
    const { result } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await expect(result.current()).rejects.toThrow('not been confirmed saved')
    })
  })

  it('waits through a short restoration settle but refuses an unavailable session', async () => {
    gate.until = Date.now() + 2500
    const { result } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    let flush: Promise<void>
    await act(async () => {
      flush = result.current()
      await vi.advanceTimersByTimeAsync(2525)
      await flush
    })
    expect(saveSession).toHaveBeenCalledOnce()
    gate.until = Infinity
    await expect(result.current()).rejects.toThrow('not ready')
    expect(saveSession).toHaveBeenCalledOnce()
  })

  it('does not warn on browser exit after the same form was confirmed saved', async () => {
    const { result } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await result.current()
    })
    const event = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
  })

  it('warns on browser exit with queued form edits', () => {
    renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    const event = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not start a queued save after the form unmounts', async () => {
    const { unmount } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('does not persist through a replaced engine even when the report ID stays the same', async () => {
    let finish!: () => void
    updateSessionData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    await act(async () => {
      useSessionStore.setState({ engineRevision: useSessionStore.getState().engineRevision + 1 })
      finish()
    })
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('does not persist another report after a delayed local update completes', async () => {
    let finish!: () => void
    updateSessionData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const { rerender } = renderHook(useFormSessionSync, {
      initialProps: { reportId: 'report-a', formData },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).toHaveBeenCalledTimes(1)
    setSession('report-b')
    rerender({ reportId: 'report-b', formData: {} as ValuationFormData })
    await act(async () => {
      finish()
    })
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('retains edits and saves while the same report remains active', async () => {
    renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).toHaveBeenCalledWith(
      expect.objectContaining({ revenue: 100000, ebitda: 20000 })
    )
    expect(saveSession).toHaveBeenCalledWith('autosave')
  })

  it('does not revive an obsolete operation when returning to the same report', async () => {
    let finish!: () => void
    updateSessionData.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const { rerender } = renderHook(useFormSessionSync, {
      initialProps: { reportId: 'report-a', formData },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    setSession('report-b')
    rerender({ reportId: 'report-b', formData: {} as ValuationFormData })
    setSession('report-a')
    rerender({ reportId: 'report-a', formData: {} as ValuationFormData })
    await act(async () => {
      finish()
    })
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('saves current edits through StrictMode effect replay', async () => {
    renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).toHaveBeenCalledTimes(1)
    expect(saveSession).toHaveBeenCalledTimes(1)
  })

  it('does not send a PATCH when PostgreSQL returns matching fields in another key order', async () => {
    renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    const payload = updateSessionData.mock.calls[0][0]
    updateSessionData.mockClear()
    saveSession.mockClear()
    setSession('report-b', {
      ...payload,
      current_year_data: Object.fromEntries(Object.entries(payload.current_year_data).reverse()),
    })
    renderHook(() => useFormSessionSync({ reportId: 'report-b', formData }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
  })
})
