import { afterEach, describe, expect, it, vi } from 'vitest'
import { generalLogger } from '../logger'
import {
  globalPerformanceMonitor,
  performanceMonitor,
  performanceThresholds,
  startPerformanceSummaryLogging,
  stopPerformanceSummaryLogging,
} from './metrics'

vi.mock('../logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('performance summary logging', () => {
  afterEach(() => {
    stopPerformanceSummaryLogging()
    performanceMonitor.clear()
    vi.restoreAllMocks()
  })

  it('starts one summary interval and logs only when metrics exist', () => {
    const intervalId = 654 as unknown as ReturnType<typeof setInterval>
    let scheduledCallback: (() => void) | null = null
    const setIntervalFn = vi.fn((callback: () => void) => {
      scheduledCallback = callback
      return intervalId
    }) as unknown as typeof setInterval
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval

    startPerformanceSummaryLogging({ setIntervalFn })
    startPerformanceSummaryLogging({ setIntervalFn })

    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)

    scheduledCallback?.()
    expect(generalLogger.info).not.toHaveBeenCalledWith(
      '[PerformanceMonitor] Performance summary',
      expect.anything()
    )

    performanceMonitor.addMetric({
      name: 'render:test',
      duration: 1,
      startTime: 0,
      endTime: 1,
      category: 'render',
    })

    scheduledCallback?.()
    expect(generalLogger.info).toHaveBeenCalledWith(
      '[PerformanceMonitor] Performance summary',
      expect.objectContaining({ totalMetrics: 1 })
    )

    stopPerformanceSummaryLogging({ clearIntervalFn })
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId)
  })

  it('keeps the legacy measure signature on the canonical singleton', async () => {
    const result = await globalPerformanceMonitor.measure(
      'session-create',
      async () => 'ok',
      performanceThresholds.sessionCreate,
      { reportId: 'report-1' }
    )

    expect(result).toBe('ok')
    expect(globalPerformanceMonitor).toBe(performanceMonitor)
    expect(performanceMonitor.getMetrics()).toEqual([
      expect.objectContaining({
        name: 'session-create',
        category: 'api',
        metadata: { reportId: 'report-1' },
      }),
    ])
  })
})
