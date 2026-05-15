// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleManualVersionHistorySync } from './manualVersionHistorySync'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function flushMicrotasks() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
  }
}

describe('scheduleManualVersionHistorySync', () => {
  it('fetches versions after the delay and clears the timeout ref', () => {
    const timeoutRef = { current: null }
    const fetchVersions = vi.fn().mockResolvedValue(undefined)

    scheduleManualVersionHistorySync({
      timeoutRef,
      reportId: 'report-1',
      fetchVersions,
      isStillTarget: () => true,
      onError: vi.fn(),
      delayMs: 25,
    })

    expect(fetchVersions).not.toHaveBeenCalled()
    vi.advanceTimersByTime(25)

    expect(fetchVersions).toHaveBeenCalledWith('report-1')
    expect(timeoutRef.current).toBeNull()
  })

  it('cancels the previous timer when re-scheduled', () => {
    const timeoutRef = { current: null }
    const fetchVersions = vi.fn().mockResolvedValue(undefined)

    scheduleManualVersionHistorySync({
      timeoutRef,
      reportId: 'old-report',
      fetchVersions,
      isStillTarget: () => true,
      onError: vi.fn(),
      delayMs: 50,
    })
    scheduleManualVersionHistorySync({
      timeoutRef,
      reportId: 'new-report',
      fetchVersions,
      isStillTarget: () => true,
      onError: vi.fn(),
      delayMs: 50,
    })

    vi.advanceTimersByTime(50)

    expect(fetchVersions).toHaveBeenCalledTimes(1)
    expect(fetchVersions).toHaveBeenCalledWith('new-report')
  })

  it('does not fetch when the submit target is stale before the timer fires', () => {
    const timeoutRef = { current: null }
    const fetchVersions = vi.fn().mockResolvedValue(undefined)

    scheduleManualVersionHistorySync({
      timeoutRef,
      reportId: 'report-1',
      fetchVersions,
      isStillTarget: () => false,
      onError: vi.fn(),
      delayMs: 10,
    })

    vi.advanceTimersByTime(10)

    expect(fetchVersions).not.toHaveBeenCalled()
  })

  it('reports fetch errors only while the target remains current', async () => {
    const timeoutRef = { current: null }
    const error = new Error('sync failed')
    const onError = vi.fn()

    scheduleManualVersionHistorySync({
      timeoutRef,
      reportId: 'report-1',
      fetchVersions: vi.fn().mockRejectedValue(error),
      isStillTarget: () => true,
      onError,
      delayMs: 10,
    })

    vi.advanceTimersByTime(10)
    await flushMicrotasks()

    expect(onError).toHaveBeenCalledWith(error)
  })

  it('suppresses fetch errors after the target becomes stale', async () => {
    const timeoutRef = { current: null }
    let current = true
    const onError = vi.fn()

    scheduleManualVersionHistorySync({
      timeoutRef,
      reportId: 'report-1',
      fetchVersions: vi.fn().mockRejectedValue(new Error('sync failed')),
      isStillTarget: () => current,
      onError,
      delayMs: 10,
    })

    vi.advanceTimersByTime(10)
    current = false
    await flushMicrotasks()

    expect(onError).not.toHaveBeenCalled()
  })
})
