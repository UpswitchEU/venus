import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfRequestRefusedError } from '@/hooks/pdfGenerationModel'
import {
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'
import { PDF_STALE_POLL_INTERVAL_MS } from './usePdfStalenessLifecycleModel'

const refusal = {
  code: 'SEALED_REPORT_INPUT_INCOMPLETE',
  remediation: 'Complete the client and engagement details, then export again.',
}

// F-04: after a background generation failed, the lifecycle kept re-reading the full
// report every 2.5 s for up to two minutes and only then showed a generic "not ready"
// banner — the reason the server gave was never rendered.
describe('usePdfStalenessLifecycle after a failed generation', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  function renderLifecycle(initial: UsePdfStalenessLifecycleParams) {
    return renderHook((p: UsePdfStalenessLifecycleParams) => usePdfStalenessLifecycle(p), {
      initialProps: initial,
    })
  }

  it('stops polling and shows the stalled banner with the refusal as soon as the job fails', async () => {
    const getReport = vi.fn().mockReturnValue(new Promise(() => undefined))
    const generating = makeParams({
      getReport,
      isPdfGenerating: true,
      pdfGenerationState: { url: null, status: 'generating' },
    })
    const { result, rerender } = renderLifecycle(generating)
    expect(getReport).not.toHaveBeenCalled()

    rerender({
      ...generating,
      isPdfGenerating: false,
      pdfGenerationState: { url: null, status: 'error', refusal },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PDF_STALE_POLL_INTERVAL_MS * 4)
    })

    // Effect G's one post-generation sync may run; the blind 2.5 s loop does not.
    expect(getReport.mock.calls.length).toBeLessThanOrEqual(1)
    expect(result.current.pdfWaitTimedOut).toBe(true)
    expect(result.current.pdfGenerationFailure).toEqual({ refusal })
  })

  it('reports a failure without a stated reason too, so the generic banner shows', () => {
    const { result } = renderLifecycle(
      makeParams({ pdfGenerationState: { url: null, status: 'error' } })
    )

    expect(result.current.pdfWaitTimedOut).toBe(true)
    expect(result.current.pdfGenerationFailure).toEqual({ refusal: null })
  })

  it('resumes polling when an edit starts a new stale cycle', async () => {
    const getReport = vi.fn().mockReturnValue(new Promise(() => undefined))
    const failed = makeParams({
      getReport,
      pdfGenerationState: { url: null, status: 'error', refusal },
    })
    const { result, rerender } = renderLifecycle(failed)
    expect(getReport).not.toHaveBeenCalled()

    rerender({
      ...failed,
      report: makeReport({ reportUpdatedAt: new Date('2026-05-02T09:00:00Z') }),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(result.current.pdfGenerationFailure).toBeNull()
    expect(getReport).toHaveBeenCalled()
  })

  it('does not report a failure once the PDF is fresh', () => {
    const { result } = renderLifecycle(
      makeParams({
        report: makeReport({
          reportUpdatedAt: new Date('2026-05-01T12:00:00Z'),
          pdfGeneratedAt: new Date('2026-05-01T12:00:00Z'),
        }),
        pdfGenerationState: { url: null, status: 'error', refusal },
      })
    )

    expect(result.current.pdfGenerationFailure).toBeNull()
  })

  it("names the server's reason when a retry is refused", async () => {
    const generatePdf = vi.fn().mockRejectedValue(new PdfRequestRefusedError(refusal, 422))
    const getReport = vi.fn().mockReturnValue(new Promise(() => undefined))
    const params = makeParams({ generatePdf, getReport })
    const { result } = renderLifecycle(params)
    const readsBeforeRetry = getReport.mock.calls.length

    await act(async () => {
      await result.current.retry()
    })

    expect(params.showRetryFailureToast).toHaveBeenCalledWith('pdfExportFailed', {
      description: 'pdfRefusal.SEALED_REPORT_INPUT_INCOMPLETE',
    })
    // A refused report is not re-read as if the job might still finish.
    expect(getReport.mock.calls.length).toBe(readsBeforeRetry)
  })
})
