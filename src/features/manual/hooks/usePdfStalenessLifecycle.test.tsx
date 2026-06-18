/**
 * usePdfStalenessLifecycle — behaviour pins for the consolidated PDF-staleness
 * FSM. Before Phase 4c.2 Hook 3 this was 3 effects + 4 refs + 4 useState +
 * 1 retry callback living inline in `ManualLayout.tsx`. The hook collapses
 * the `pdfWaitTimedOut` three-producer pattern into a single owner.
 *
 * Notes on the simulation harness:
 * - We use `vi.useFakeTimers()` so the 60s wait timer + 2.5s poll interval
 *   can be advanced deterministically.
 * - `getReport` is injected as a hook param so each test controls the
 *   response shape (fresh vs stale, 404 vs success).
 * - `useManualResultsStore` is touched by the hook (read of `.getState()`
 *   inside the poll merge). We seed the store before each test.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import {
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle'

function makeReport(partial: Partial<ValuationReportData> = {}): ValuationReportData {
  return {
    id: 'rep_1',
    companyName: 'Test BV',
    valuation: 1_000_000,
    multiple: 5,
    generatedAt: new Date('2026-05-01T00:00:00Z'),
    confidenceLevel: 'high',
    metrics: [],
    htmlReport: '<div>html</div>',
    reportUpdatedAt: new Date('2026-05-01T12:00:00Z'),
    pdfGeneratedAt: new Date('2026-05-01T11:00:00Z'),
    pdfUrl: 'https://example/old.pdf',
    ...partial,
  } as ValuationReportData
}

function makeFreshResponse(partial: Partial<ValuationResponse> = {}): ValuationResponse {
  return {
    valuation_id: 'rep_1',
    company_name: 'Test BV',
    updated_at: '2026-05-01T13:00:00.000Z',
    pdf_generated_at: '2026-05-01T13:00:01.000Z',
    pdf_url: 'https://example/new.pdf',
    ...partial,
  } as ValuationResponse
}

function makeParams(
  override: Partial<UsePdfStalenessLifecycleParams> = {}
): UsePdfStalenessLifecycleParams {
  return {
    report: makeReport(),
    isPdfReady: false,
    isPdfGenerating: false,
    pdfGenerationState: { url: null },
    persistedReportLookupId: 'uuid-aaaa-bbbb',
    canDownloadPdf: true,
    generatePdf: vi.fn().mockResolvedValue(undefined),
    getReport: vi.fn(),
    setResult: vi.fn(),
    setReport: vi.fn(),
    openStarterPaywall: vi.fn(),
    showRetryFailureToast: vi.fn(),
    translate: vi.fn((key: string) => key),
    ...override,
  }
}

describe('usePdfStalenessLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    useManualResultsStore.setState({ result: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    useManualResultsStore.setState({ result: null })
  })

  describe('pdfStale derivation', () => {
    it('returns false when no report is present', () => {
      const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report: null })))
      expect(result.current.pdfStale).toBe(false)
    })

    it('returns true when reportUpdatedAt is newer than pdfGeneratedAt', () => {
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
      })
      const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report })))
      expect(result.current.pdfStale).toBe(true)
    })

    it('returns false when local PDF is ready but report.pdfGeneratedAt is still null', () => {
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: null,
      })
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, isPdfReady: true }))
      )
      expect(result.current.pdfStale).toBe(false)
    })

    it('returns false when local PDF is ready with a URL even if pdfGeneratedAt lags', () => {
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
      })
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(
          makeParams({
            report,
            isPdfReady: true,
            pdfGenerationState: { url: 'https://example/fresh.pdf' },
          })
        )
      )
      expect(result.current.pdfStale).toBe(false)
    })
  })

  describe('wait timeout', () => {
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
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, getReport }))
      )

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
        return new Promise<ValuationResponse>(() => {
          // Keep the poll pending so the lifecycle stays in its in-flight state.
        })
      })
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, getReport }))
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_600)
      })
      expect(pollCalls).toBeGreaterThanOrEqual(2)
      expect(result.current.pdfPollTransientCount).toBe(2)

      // Base 60s window alone must not fire once transient blips extended the deadline.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001)
      })
      expect(result.current.pdfWaitTimedOut).toBe(false)

      // Two +20s extensions → 100s stall window from the last reschedule.
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

  describe('polling kickoff', () => {
    // Note: full poll-loop semantics (12-unchanged-streak, session-404 backoff,
    // per-cycle counter resets) are validated end-to-end by the panel-level
    // QA flow — these unit tests verify the kickoff conditions only because
    // `setInterval` with an async callback does not cooperate cleanly with
    // fake-timer microtask flushing.

    it('polls immediately when a stale cycle begins', async () => {
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
      })
      const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
      renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

      await act(async () => {
        await Promise.resolve()
      })

      expect(getReport).toHaveBeenCalledTimes(1)
    })

    it('does not poll when persistedReportLookupId is null', async () => {
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
      })
      const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
      renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, getReport, persistedReportLookupId: null }))
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(getReport).not.toHaveBeenCalled()
    })

    it('does not poll while pdfStale is false', async () => {
      const fresh = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
      })
      const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
      renderHook(() => usePdfStalenessLifecycle(makeParams({ report: fresh, getReport })))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(getReport).not.toHaveBeenCalled()
    })

    it('surfaces stalled banner after unchanged stale pdf_generated_at streak', async () => {
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
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, getReport }))
      )

      await act(async () => {
        for (let i = 0; i < 12; i++) {
          await vi.advanceTimersByTimeAsync(2_500)
        }
      })

      expect(result.current.pdfWaitTimedOut).toBe(true)
      expect(getReport.mock.calls.length).toBeGreaterThanOrEqual(12)
    })

    it('never surfaces the stalled banner when polls report pdf_coherent=true despite stale timestamps', async () => {
      // The exact no-op-open shape: updated_at > pdf_generated_at (timestamps say
      // "stale") but Titan's authoritative raw-vs-raw coherence says the PDF still
      // matches current economics. The poll must recognise freshness and never
      // escalate to the stalled banner, even across the 12-unchanged streak window.
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
      })
      const coherentResponse = {
        ...makeFreshResponse(),
        updated_at: '2026-05-01T14:00:00.000Z',
        pdf_generated_at: '2026-05-01T13:00:00.000Z',
        pdf_url: 'https://example/old.pdf',
        pdf_coherent: true,
      } as ValuationResponse
      const getReport = vi.fn().mockResolvedValue(coherentResponse)
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, getReport }))
      )

      await act(async () => {
        for (let i = 0; i < 12; i++) {
          await vi.advanceTimersByTimeAsync(2_500)
        }
      })

      expect(result.current.pdfWaitTimedOut).toBe(false)
    })

    it('does not poll once stalled (after the 60s wait timer fires)', async () => {
      const report = makeReport({
        reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
        pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
      })
      const getReport = vi.fn().mockRejectedValue(new APIError('whatever', 500))
      const { result } = renderHook(() =>
        usePdfStalenessLifecycle(makeParams({ report, getReport }))
      )

      // Advance past the 60s timeout to enter the stalled state.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_001)
      })
      expect(result.current.pdfWaitTimedOut).toBe(true)

      // Clear the call history that accumulated during the 60s window,
      // then advance more — no new polls should fire because the poll
      // effect early-returns on `pdfWaitTimedOut`.
      const callsBeforeStall = getReport.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(getReport.mock.calls.length).toBe(callsBeforeStall)
    })
  })

  describe('retry handle', () => {
    it('opens the paywall on a 402 retry error', async () => {
      // No stale report → polling effect does not run, so the only call to
      // getReport comes from the retry handler itself. Mocking 402 on every
      // call removes order-sensitivity from the test.
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

    it('successful retry clears pdfWaitTimedOut + calls generatePdf', async () => {
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
  })

  describe('client-side PDF URL mirror (Effect A)', () => {
    it('writes the generated URL into report when isPdfReady + canDownloadPdf are true', () => {
      const params = makeParams({
        isPdfReady: true,
        pdfGenerationState: { url: 'https://example/local.pdf' },
      })
      renderHook(() => usePdfStalenessLifecycle(params))
      expect(params.setReport).toHaveBeenCalled()
    })

    it('does not write when canDownloadPdf is false', () => {
      const params = makeParams({
        isPdfReady: true,
        canDownloadPdf: false,
        pdfGenerationState: { url: 'https://example/local.pdf' },
      })
      renderHook(() => usePdfStalenessLifecycle(params))
      expect(params.setReport).not.toHaveBeenCalled()
    })

    it('does not write when no URL is available', () => {
      const params = makeParams({
        isPdfReady: true,
        pdfGenerationState: { url: null },
      })
      renderHook(() => usePdfStalenessLifecycle(params))
      expect(params.setReport).not.toHaveBeenCalled()
    })
  })

  describe('cross-report navigation cancellation', () => {
    // These tests deliberately use real timers — they exercise async-cancellation
    // semantics via controlled Promises, NOT the polling interval. The
    // `setInterval` + async callback + fake-timer interaction is known to be
    // unreliable (see the polling-kickoff describe block above), so the
    // poll-cancellation case is covered by the cleanup mechanic in the source
    // (`return () => { cancelled = true; clearInterval(id); ... }`) which is
    // obvious by inspection.
    beforeEach(() => {
      vi.useRealTimers()
    })

    it('retry aborts after unmount — no setResult call against the global store', async () => {
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

      // Start the retry. Don't await it yet — the inner `await getReport()`
      // never resolves until we call `resolveGetReport(...)`.
      let retryPromise: Promise<void> = Promise.resolve()
      act(() => {
        retryPromise = result.current.retry()
      })

      // The retry handler awaits `generatePdf()` first (1 microtask), then
      // calls `getReport(...)` (which sets `resolveGetReport`). Use waitFor
      // so we don't unmount before getReport has been invoked.
      await waitFor(() => expect(getReport).toHaveBeenCalled())

      // Unmount BEFORE the in-flight getReport resolves. The hook's
      // mount-effect cleanup flips `isMountedRef.current = false`.
      act(() => {
        unmount()
      })

      // Now resolve. The retry handler's `isStillRelevant()` guard sees
      // `isMountedRef === false` and bails before touching setResult.
      await act(async () => {
        resolveGetReport?.(makeFreshResponse())
        await retryPromise
      })

      expect(params.setResult).not.toHaveBeenCalled()
      expect(params.setReport).not.toHaveBeenCalled()
    })

    it('retry aborts after persistedReportLookupId changes — no clobber of new report', async () => {
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

      // Kick off the retry — it captures `'uuid-A'` and starts awaiting getReport.
      let retryPromise: Promise<void> = Promise.resolve()
      act(() => {
        retryPromise = result.current.retry()
      })

      await waitFor(() => expect(getReport).toHaveBeenCalled())

      // Mid-flight, the user navigates to a different report.
      act(() => {
        rerender({ ...baseParams, persistedReportLookupId: 'uuid-B' })
      })

      // Now the old getReport resolves with report A's data. The retry
      // handler's `isStillRelevant()` guard sees `lookupIdRef.current === 'uuid-B'`
      // while the captured `startLookupId === 'uuid-A'` and bails.
      await act(async () => {
        resolveGetReport?.(makeFreshResponse({ valuation_id: 'val_A' }))
        await retryPromise
      })

      expect(baseParams.setResult).not.toHaveBeenCalled()
    })
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

  describe('post-generation sync poll', () => {
    beforeEach(() => {
      vi.useRealTimers()
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
})
