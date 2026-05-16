/**
 * useRestorationGate — behaviour pins for the 5s safety-timeout fallback.
 * Before Phase 4c.2 this state lived inline in `ManualLayout` (7,032 lines)
 * with the timer + the AND-chain derivation scattered across separate sites.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type UseRestorationGateParams, useRestorationGate } from './useRestorationGate'

describe('useRestorationGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for effectiveIsRestoringExistingReport when not restoring', () => {
    const { result } = renderHook(() =>
      useRestorationGate({
        isRestoringExistingReport: false,
        restorationComplete: false,
      })
    )
    expect(result.current.effectiveIsRestoringExistingReport).toBe(false)
    expect(result.current.restoreTimeoutFired).toBe(false)
  })

  it('returns true while restoring and restoration is incomplete', () => {
    const { result } = renderHook(() =>
      useRestorationGate({
        isRestoringExistingReport: true,
        restorationComplete: false,
      })
    )
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)
  })

  it('clears the gate when SessionRestorationService signals completion', () => {
    const { result, rerender } = renderHook(
      (props: UseRestorationGateParams) => useRestorationGate(props),
      {
        initialProps: {
          isRestoringExistingReport: true,
          restorationComplete: false,
        },
      }
    )
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)

    rerender({ isRestoringExistingReport: true, restorationComplete: true })
    expect(result.current.effectiveIsRestoringExistingReport).toBe(false)
  })

  it('fires the safety timeout after 5 seconds and clears the gate', () => {
    const { result } = renderHook(() =>
      useRestorationGate({
        isRestoringExistingReport: true,
        restorationComplete: false,
      })
    )
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)
    expect(result.current.restoreTimeoutFired).toBe(false)

    // Advance 4.999s — timer should NOT have fired yet.
    act(() => {
      vi.advanceTimersByTime(4_999)
    })
    expect(result.current.restoreTimeoutFired).toBe(false)
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)

    // Advance past 5s — timer fires.
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(result.current.restoreTimeoutFired).toBe(true)
    expect(result.current.effectiveIsRestoringExistingReport).toBe(false)
  })

  it('cancels the timer when isRestoringExistingReport flips false before 5s', () => {
    const { result, rerender } = renderHook(
      (props: UseRestorationGateParams) => useRestorationGate(props),
      {
        initialProps: {
          isRestoringExistingReport: true,
          restorationComplete: false,
        },
      }
    )

    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(result.current.restoreTimeoutFired).toBe(false)

    // Restoration completes (or session resets) within the 5s window.
    rerender({ isRestoringExistingReport: false, restorationComplete: false })

    // Advance well past the original 5s — timer must have been cancelled.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current.restoreTimeoutFired).toBe(false)
  })

  it('re-arms the timer when a new restoration cycle begins', () => {
    const { result, rerender } = renderHook(
      (props: UseRestorationGateParams) => useRestorationGate(props),
      {
        initialProps: {
          isRestoringExistingReport: true,
          restorationComplete: false,
        },
      }
    )

    // First cycle fires.
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(result.current.restoreTimeoutFired).toBe(true)

    // User finishes the cycle; gate clears.
    rerender({ isRestoringExistingReport: false, restorationComplete: true })
    expect(result.current.restoreTimeoutFired).toBe(false)

    // A new cycle begins (e.g. navigating to a different report).
    rerender({ isRestoringExistingReport: true, restorationComplete: false })
    expect(result.current.restoreTimeoutFired).toBe(false)
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)

    // The 5s clock starts fresh.
    act(() => {
      vi.advanceTimersByTime(5_001)
    })
    expect(result.current.restoreTimeoutFired).toBe(true)
  })

  it('keeps the gate false once the timeout has fired, even while restoring stays true', () => {
    const { result } = renderHook(() =>
      useRestorationGate({
        isRestoringExistingReport: true,
        restorationComplete: false,
      })
    )

    act(() => {
      vi.advanceTimersByTime(5_001)
    })
    expect(result.current.effectiveIsRestoringExistingReport).toBe(false)
    expect(result.current.restoreTimeoutFired).toBe(true)
  })

  it('treats restorationComplete=true as authoritative even before the timeout', () => {
    const { result, rerender } = renderHook(
      (props: UseRestorationGateParams) => useRestorationGate(props),
      {
        initialProps: {
          isRestoringExistingReport: true,
          restorationComplete: false,
        },
      }
    )
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)

    rerender({ isRestoringExistingReport: true, restorationComplete: true })
    expect(result.current.effectiveIsRestoringExistingReport).toBe(false)
    // Timer hasn't fired, but the service signal is enough.
    expect(result.current.restoreTimeoutFired).toBe(false)
  })
})
