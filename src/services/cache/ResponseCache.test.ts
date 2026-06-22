import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ResponseCache,
  responseCache,
  startResponseCacheCleanup,
  stopResponseCacheCleanup,
} from './ResponseCache'

vi.mock('../../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

describe('ResponseCache', () => {
  afterEach(() => {
    stopResponseCacheCleanup()
    responseCache.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns fresh cached entries and removes expired ones', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const cache = new ResponseCache()

    cache.set('quote:1', { value: 42 }, 100)
    expect(cache.get<{ value: number }>('quote:1')).toEqual({ value: 42 })
    expect(cache.has('quote:1')).toBe(true)

    vi.setSystemTime(100)
    expect(cache.get('quote:1')).toBeUndefined()
    expect(cache.has('quote:1')).toBe(false)
  })

  it('starts one global cleanup interval and can stop it explicitly', () => {
    const intervalId = 123 as unknown as ReturnType<typeof setInterval>
    let scheduledCallback: (() => void) | null = null
    const setIntervalFn = vi.fn((callback: () => void) => {
      scheduledCallback = callback
      return intervalId
    }) as unknown as typeof setInterval
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval
    const cleanupExpired = vi.spyOn(responseCache, 'cleanupExpired').mockReturnValue(0)

    startResponseCacheCleanup({ setIntervalFn })
    startResponseCacheCleanup({ setIntervalFn })

    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)

    scheduledCallback?.()
    expect(cleanupExpired).toHaveBeenCalledTimes(1)

    stopResponseCacheCleanup({ clearIntervalFn })
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId)
  })
})
