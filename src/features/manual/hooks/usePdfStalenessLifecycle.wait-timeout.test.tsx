import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '@/types/errors'
import {
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'

describe('usePdfStalenessLifecycle wait timeout', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('flips pdfWaitTimedOut true after 60 seconds while stale', () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const { result } = renderHook(() =>
      usePdfStalenessLifecycle(
        makeParams({
          report,
          persistedReportLookupId: null,
        })
      )
    )
    expect(result.current.pdfWaitTimedOut).toBe(false)

    act(() => {
      vi.advanceTimersByTime(59_999)
    })
    expect(result.current.pdfWaitTimedOut).toBe(false)

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(result.current.pdfWaitTimedOut).toBe(true)
  })

  it('increments pdfPollTransientCount on transient 503 poll errors', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockRejectedValue(new APIError('pooler', 503))
    const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_600)
    })

    expect(result.current.pdfPollTransientCount).toBeGreaterThanOrEqual(1)
  })

  it('extends the stall deadline after transient 503 poll errors', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    let pollCalls = 0
    const getReport = vi.fn().mockImplementation(async () => {
      pollCalls += 1
      if (pollCalls <= 2) {
        throw new APIError('pooler', 503)
      }
      return new Promise(() => {
        // Keep the poll pending so the lifecycle stays in its in-flight state.
      })
    })
    const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_600)
    })
    expect(pollCalls).toBeGreaterThanOrEqual(2)
    expect(result.current.pdfPollTransientCount).toBe(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001)
    })
    expect(result.current.pdfWaitTimedOut).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(42_000)
    })
    expect(result.current.pdfWaitTimedOut).toBe(true)
  })

  it('does not surface stalled while async PDF generation is in flight', () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const { result, rerender } = renderHook(
      (props: UsePdfStalenessLifecycleParams) => usePdfStalenessLifecycle(props),
      {
        initialProps: makeParams({ report, persistedReportLookupId: null }),
      }
    )

    act(() => {
      vi.advanceTimersByTime(60_001)
    })
    expect(result.current.pdfWaitTimedOut).toBe(true)

    rerender(makeParams({ report, isPdfGenerating: true, persistedReportLookupId: null }))
    expect(result.current.pdfWaitTimedOut).toBe(false)
  })

  it('resets pdfWaitTimedOut when staleness clears', () => {
    const stale = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const fresh = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T14:01:00Z'),
    })
    const { result, rerender } = renderHook(
      (props: UsePdfStalenessLifecycleParams) => usePdfStalenessLifecycle(props),
      {
        initialProps: makeParams({
          report: stale,
          persistedReportLookupId: null,
        }),
      }
    )
    act(() => {
      vi.advanceTimersByTime(60_001)
    })
    expect(result.current.pdfWaitTimedOut).toBe(true)

    rerender(makeParams({ report: fresh, getReport: vi.fn() }))
    expect(result.current.pdfWaitTimedOut).toBe(false)
  })
})
