import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import {
  makeFreshResponse,
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'

describe('usePdfStalenessLifecycle retry handle', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('opens the paywall on a 402 retry error', async () => {
    const getReport = vi.fn().mockRejectedValue(new APIError('paywall', 402))
    const params = makeParams({
      report: makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
      }),
      getReport,
    })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))

    await act(async () => {
      await result.current.retry()
    })

    expect(params.openStarterPaywall).toHaveBeenCalledWith('pdf_download')
    expect(params.showRetryFailureToast).not.toHaveBeenCalled()
  })

  it('routes non-402 retry errors to the failure toast', async () => {
    const getReport = vi.fn().mockRejectedValue(new Error('boom'))
    const params = makeParams({
      report: makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
      }),
      getReport,
    })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))

    await act(async () => {
      await result.current.retry()
    })

    expect(params.showRetryFailureToast).toHaveBeenCalledWith(
      'pdfExportFailed',
      expect.objectContaining({ description: 'pdfExportFailedDesc' })
    )
  })

  it('successful retry clears pdfWaitTimedOut and calls generatePdf', async () => {
    const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
    const generatePdf = vi.fn().mockResolvedValue(undefined)
    const params = makeParams({
      report: makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
      }),
      getReport,
      generatePdf,
    })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))

    await act(async () => {
      await result.current.retry()
    })
    expect(generatePdf).toHaveBeenCalledTimes(1)
    expect(getReport).toHaveBeenCalledTimes(1)
    expect(result.current.pdfWaitTimedOut).toBe(false)
    expect(params.setResult).toHaveBeenCalled()
  })

  it('refuses to act when persistedReportLookupId is null', async () => {
    const params = makeParams({ persistedReportLookupId: null })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))
    await act(async () => {
      await result.current.retry()
    })
    expect(params.generatePdf).not.toHaveBeenCalled()
    expect(params.getReport).not.toHaveBeenCalled()
  })

  it('opens the paywall instead of acting when canDownloadPdf is false', async () => {
    const params = makeParams({ canDownloadPdf: false })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))
    await act(async () => {
      await result.current.retry()
    })
    expect(params.openStarterPaywall).toHaveBeenCalledWith('pdf_download')
    expect(params.generatePdf).not.toHaveBeenCalled()
  })

  it('re-arms the wait timer when retry refetch still returns a stale PDF row', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const staleResponse = {
      ...makeFreshResponse(),
      updated_at: '2026-05-01T14:00:00.000Z',
      pdf_generated_at: '2026-05-01T13:00:00.000Z',
      pdf_url: 'https://example/old.pdf',
    } as ValuationResponse
    const getReport = vi.fn().mockResolvedValue(staleResponse)
    const generatePdf = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      usePdfStalenessLifecycle(makeParams({ report, getReport, generatePdf }))
    )

    await act(async () => {
      await result.current.retry()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001)
    })

    expect(result.current.pdfWaitTimedOut).toBe(true)
  })

  it('does not toast on transient retry getReport errors', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockRejectedValue(new APIError('pooler', 503))
    const showRetryFailureToast = vi.fn()
    const { result } = renderHook(() =>
      usePdfStalenessLifecycle(makeParams({ report, getReport, showRetryFailureToast }))
    )

    await act(async () => {
      await result.current.retry()
    })

    expect(showRetryFailureToast).not.toHaveBeenCalled()
  })

  it('clears pdfWaitTimedOut when retry refetch returns a fresh pdf_generated_at', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockRejectedValue(new APIError('busy', 500))
    const params = makeParams({ report, getReport })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001)
    })
    expect(result.current.pdfWaitTimedOut).toBe(true)

    getReport.mockResolvedValue(makeFreshResponse())
    await act(async () => {
      await result.current.retry()
    })

    expect(result.current.pdfWaitTimedOut).toBe(false)
  })
})

describe('usePdfStalenessLifecycle cross-report navigation cancellation', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
    vi.useRealTimers()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('retry aborts after unmount without writing stale report state', async () => {
    let resolveGetReport: ((response: ValuationResponse) => void) | null = null
    const getReport = vi.fn().mockImplementation(
      () =>
        new Promise<ValuationResponse>((resolve) => {
          resolveGetReport = resolve
        })
    )
    const params = makeParams({
      report: makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
      }),
      getReport,
    })
    const { result, unmount } = renderHook(() => usePdfStalenessLifecycle(params))

    let retryPromise: Promise<void> = Promise.resolve()
    act(() => {
      retryPromise = result.current.retry()
    })

    await waitFor(() => expect(getReport).toHaveBeenCalled())

    act(() => {
      unmount()
    })

    await act(async () => {
      resolveGetReport?.(makeFreshResponse())
      await retryPromise
    })

    expect(params.setResult).not.toHaveBeenCalled()
    expect(params.setReport).not.toHaveBeenCalled()
  })

  it('retry aborts after persistedReportLookupId changes without clobbering new report', async () => {
    let resolveGetReport: ((response: ValuationResponse) => void) | null = null
    const getReport = vi.fn().mockImplementation(
      () =>
        new Promise<ValuationResponse>((resolve) => {
          resolveGetReport = resolve
        })
    )
    const baseParams = makeParams({
      report: makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
      }),
      getReport,
      persistedReportLookupId: 'uuid-A',
    })
    const { result, rerender } = renderHook(
      (p: UsePdfStalenessLifecycleParams) => usePdfStalenessLifecycle(p),
      { initialProps: baseParams }
    )

    let retryPromise: Promise<void> = Promise.resolve()
    act(() => {
      retryPromise = result.current.retry()
    })

    await waitFor(() => expect(getReport).toHaveBeenCalled())

    act(() => {
      rerender({ ...baseParams, persistedReportLookupId: 'uuid-B' })
    })

    await act(async () => {
      resolveGetReport?.(makeFreshResponse({ valuation_id: 'val_A' }))
      await retryPromise
    })

    expect(baseParams.setResult).not.toHaveBeenCalled()
  })
})
