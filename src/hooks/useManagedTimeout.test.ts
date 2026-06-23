import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useManagedTimeout } from './useManagedTimeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('useManagedTimeout', () => {
  it('runs the scheduled callback after the delay', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    const { result } = renderHook(() => useManagedTimeout())

    act(() => {
      result.current.schedule(callback, 200)
      vi.advanceTimersByTime(199)
    })

    expect(callback).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('keeps only the latest scheduled callback', () => {
    vi.useFakeTimers()
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()

    const { result } = renderHook(() => useManagedTimeout())

    act(() => {
      result.current.schedule(firstCallback, 200)
      result.current.schedule(secondCallback, 200)
    })

    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(firstCallback).not.toHaveBeenCalled()
    expect(secondCallback).toHaveBeenCalledTimes(1)
  })

  it('clears a pending callback on demand', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    const { result } = renderHook(() => useManagedTimeout())

    act(() => {
      result.current.schedule(callback, 200)
      result.current.clear()
      vi.advanceTimersByTime(200)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('clears a pending callback on unmount', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    const { result, unmount } = renderHook(() => useManagedTimeout())

    act(() => {
      result.current.schedule(callback, 200)
    })

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(callback).not.toHaveBeenCalled()
  })
})
