import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTransientFlag } from './useTransientFlag'

afterEach(() => {
  vi.useRealTimers()
})

describe('useTransientFlag', () => {
  it('activates for the configured duration', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useTransientFlag(200))

    act(() => {
      result.current[1]()
    })

    expect(result.current[0]).toBe(true)

    act(() => {
      vi.advanceTimersByTime(199)
    })

    expect(result.current[0]).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(result.current[0]).toBe(false)
  })

  it('replaces the previous timer when reactivated', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useTransientFlag(200))

    act(() => {
      result.current[1]()
      vi.advanceTimersByTime(150)
      result.current[1]()
    })

    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(result.current[0]).toBe(true)

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(result.current[0]).toBe(false)
  })

  it('clears the active timer on unmount', () => {
    vi.useFakeTimers()

    const { result, unmount } = renderHook(() => useTransientFlag(200))

    act(() => {
      result.current[1]()
    })

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
