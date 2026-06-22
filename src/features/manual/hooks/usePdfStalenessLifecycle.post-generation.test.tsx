import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeFreshResponse,
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'

describe('usePdfStalenessLifecycle post-generation sync poll', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
    vi.useRealTimers()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('polls immediately when async generation finishes', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
    const { rerender } = renderHook(
      (props: UsePdfStalenessLifecycleParams) => usePdfStalenessLifecycle(props),
      {
        initialProps: makeParams({ report, getReport, isPdfGenerating: true }),
      }
    )

    expect(getReport).not.toHaveBeenCalled()

    rerender(makeParams({ report, getReport, isPdfGenerating: false }))

    await waitFor(() => expect(getReport).toHaveBeenCalledTimes(1))
  })

  it('recovers from stalled state when generation finishes in the background', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
    const { result, rerender } = renderHook(
      (props: UsePdfStalenessLifecycleParams) => usePdfStalenessLifecycle(props),
      {
        initialProps: makeParams({
          report,
          getReport,
          isPdfGenerating: true,
        }),
      }
    )

    rerender(makeParams({ report, getReport, isPdfGenerating: false }))

    await waitFor(() => expect(getReport).toHaveBeenCalledTimes(1))
    expect(result.current.pdfWaitTimedOut).toBe(false)
  })
})
