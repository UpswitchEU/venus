import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type { ValuationFormData } from '../../types/valuation'
import { useFormSessionSync } from '../useFormSessionSync'

vi.mock('../formSessionAutosaveDefer', () => ({
  getMercurySourceApp: () => undefined,
  getSessionAutosaveDeferRemainingMs: () => 0,
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
    updateSessionData,
    saveSession,
  })
}

describe('form autosave lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updateSessionData.mockReset().mockResolvedValue(undefined)
    saveSession.mockReset().mockResolvedValue(undefined)
    useTaxLatencyStore.setState({ items: [] })
    setSession('report-a')
  })
  afterEach(() => vi.useRealTimers())

  it('does not start a queued save after the form unmounts', async () => {
    const { unmount } = renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).not.toHaveBeenCalled()
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

  it('does not send a PATCH when normalized writable fields already match', async () => {
    renderHook(() => useFormSessionSync({ reportId: 'report-a', formData }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    const payload = updateSessionData.mock.calls[0][0]
    updateSessionData.mockClear()
    saveSession.mockClear()
    setSession('report-b', { ...payload, current_year_data: { ...payload.current_year_data } })
    renderHook(() => useFormSessionSync({ reportId: 'report-b', formData }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
  })
})
