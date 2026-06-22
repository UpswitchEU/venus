import { describe, expect, it, vi } from 'vitest'
import { createManagedInterval } from './managedInterval'

describe('createManagedInterval', () => {
  it('starts once, stops once, and can be restarted', () => {
    const intervalId = 7 as unknown as ReturnType<typeof setInterval>
    const callback = vi.fn()
    const setIntervalFn = vi.fn(() => intervalId) as unknown as typeof setInterval
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval
    const interval = createManagedInterval(callback, 1000)

    expect(interval.isRunning()).toBe(false)
    expect(interval.start({ setIntervalFn })).toBe(true)
    expect(interval.start({ setIntervalFn })).toBe(false)
    expect(interval.isRunning()).toBe(true)
    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(callback, 1000)

    expect(interval.stop({ clearIntervalFn })).toBe(true)
    expect(interval.stop({ clearIntervalFn })).toBe(false)
    expect(interval.isRunning()).toBe(false)
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId)

    expect(interval.start({ intervalMs: 250, setIntervalFn })).toBe(true)
    expect(setIntervalFn).toHaveBeenLastCalledWith(callback, 250)
  })
})
