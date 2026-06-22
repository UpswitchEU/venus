import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  globalSessionMetrics,
  startSessionMetricsSummaryLogging,
  stopSessionMetricsSummaryLogging,
} from './sessionMetrics'

vi.mock('../logger', () => ({
  storeLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('session metrics summary logging', () => {
  afterEach(() => {
    stopSessionMetricsSummaryLogging()
    globalSessionMetrics.clear()
    vi.restoreAllMocks()
  })

  it('starts one summary interval and can stop it explicitly', () => {
    const intervalId = 456 as unknown as ReturnType<typeof setInterval>
    let scheduledCallback: (() => void) | null = null
    const setIntervalFn = vi.fn((callback: () => void) => {
      scheduledCallback = callback
      return intervalId
    }) as unknown as typeof setInterval
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval
    const logSummary = vi.spyOn(globalSessionMetrics, 'logSummary')

    startSessionMetricsSummaryLogging({ setIntervalFn })
    startSessionMetricsSummaryLogging({ setIntervalFn })

    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)

    scheduledCallback?.()
    expect(logSummary).toHaveBeenCalledTimes(1)

    stopSessionMetricsSummaryLogging({ clearIntervalFn })
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId)
  })
})
