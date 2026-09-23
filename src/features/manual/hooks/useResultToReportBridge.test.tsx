/**
 * useResultToReportBridge — behaviour pins for the full Result→Report
 * bridge effect. Asserts every one of the 7 documented side effects fires
 * (or doesn't fire) under the right conditions. Before Phase 4c.2 Hook 2
 * this effect lived inline in `ManualValuationWorkspace.tsx` (~110 lines) with no
 * isolated test coverage.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { usePreparerMultipleStore } from '@/store/manual/usePreparerMultipleStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { SaveValuationResultResponse } from '@/types/api-responses'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import { rememberSavedReportAlias } from '@/utils/reportIdentityPromotion'
import { clearReportsDeleting, markReportsDeleting } from '../utils/manualReportDeleteGuard'
import {
  resolveValuationRunTrigger,
  type UseResultToReportBridgeParams,
  useResultToReportBridge,
} from './useResultToReportBridge'

function makeResult(partial: Partial<ValuationResponse> = {}): ValuationResponse {
  return {
    valuation_id: 'val_xyz',
    company_name: 'Test BV',
    current_year_data: { revenue: 2_000_000, ebitda: 400_000 },
    html_report: '<div>hello</div>',
    ...partial,
  } as ValuationResponse
}

function makeParams(
  override: Partial<UseResultToReportBridgeParams> = {}
): UseResultToReportBridgeParams {
  return {
    result: makeResult(),
    selectedMethod: 'dcf',
    reportId: 'route-id',
    canDownloadPdf: true,
    isMobile: false,
    tReport: (key) => `t:${key}`,
    onComplete: vi.fn(),
    setReport: vi.fn(),
    setRightPanelView: vi.fn(),
    setShowFullscreenModal: vi.fn(),
    generatePdf: vi.fn().mockResolvedValue(undefined),
    ...override,
  }
}

describe('resolveValuationRunTrigger', () => {
  it('marks only a start-proposal-labelled run as intent-started', () => {
    expect(resolveValuationRunTrigger('v1 – Startvoorstel')).toBe('intent')
  })

  it.each([null, undefined, ''])('treats %p as the advisor calculating', (label) => {
    expect(resolveValuationRunTrigger(label)).toBe('user')
  })
})

describe('useResultToReportBridge', () => {
  beforeEach(() => {
    // Reset the preparer store between tests so sync calls accumulate cleanly.
    usePreparerMultipleStore.setState({
      appliedMedian: null,
      benchmarkMedian: null,
      reasonKey: null,
      note: null,
      acknowledgedExtreme: false,
    } as Parameters<typeof usePreparerMultipleStore.setState>[0])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('null result', () => {
    it('clears report presentation when result is null', () => {
      const params = makeParams({ result: null })
      renderHook(() => useResultToReportBridge(params))
      expect(params.onComplete).not.toHaveBeenCalled()
      expect(params.setReport).toHaveBeenCalledWith(null)
      expect(params.setRightPanelView).not.toHaveBeenCalled()
      expect(params.setShowFullscreenModal).not.toHaveBeenCalled()
      expect(params.generatePdf).not.toHaveBeenCalled()
    })
  })

  describe('delete guard', () => {
    afterEach(() => {
      clearReportsDeleting()
    })

    it('does not map result into report while that report is being deleted', () => {
      markReportsDeleting(['val_xyz', 'route-id'])
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))

      expect(params.onComplete).not.toHaveBeenCalled()
      expect(params.setReport).not.toHaveBeenCalled()
      expect(params.setRightPanelView).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('fires every side effect in order when result is non-null', () => {
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))

      expect(params.onComplete).toHaveBeenCalledWith(params.result)
      expect(params.setReport).toHaveBeenCalledTimes(1)
      expect(params.setRightPanelView).toHaveBeenCalledWith('preview')
    })

    it('mapping a restored result cannot acknowledge a failed or pending save', () => {
      const savedAt = new Date('2026-09-19T06:12:51Z')
      useSessionStore.setState({
        lastSaved: savedAt,
        saveErrorMessage: 'Network error',
        hasUnsavedChanges: true,
      })
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))
      expect(params.setReport).toHaveBeenCalledTimes(1)
      expect(useSessionStore.getState()).toMatchObject({
        lastSaved: savedAt,
        saveErrorMessage: 'Network error',
        hasUnsavedChanges: true,
      })
    })

    it('calls generatePdf in the background when PDF is stale', () => {
      const params = makeParams({
        result: makeResult({
          updated_at: '2026-01-15T12:00:00.000Z',
          pdf_generated_at: null,
        }),
      })
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).toHaveBeenCalledTimes(1)
    })

    it('does NOT call generatePdf for a run started by the Mercury one-shot intent', async () => {
      const generatePdf = vi.fn().mockResolvedValue(undefined)
      const params = makeParams({
        generatePdf,
        runTriggerRef: { current: 'intent' },
        result: makeResult({ pdf_url: null } as Partial<ValuationResponse>),
      })
      renderHook(() => useResultToReportBridge(params))
      await waitFor(() => expect(params.setReport).toHaveBeenCalled())
      expect(generatePdf).not.toHaveBeenCalled()
      expect(params.setRightPanelView).toHaveBeenCalledWith('preview')
    })

    it('does NOT call generatePdf when PDF is fresh', () => {
      const params = makeParams({
        result: makeResult({
          updated_at: '2026-01-15T12:00:00.000Z',
          pdf_generated_at: '2026-01-15T12:00:00.000Z',
          pdf_url: 'https://example.com/report.pdf',
        }),
      })
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).not.toHaveBeenCalled()
    })

    it('does NOT call generatePdf when reportId is missing', () => {
      const params = makeParams({ reportId: undefined })
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).not.toHaveBeenCalled()
    })

    it('does NOT call generatePdf when canDownloadPdf is false', () => {
      const params = makeParams({ canDownloadPdf: false })
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).not.toHaveBeenCalled()
    })

    it('does NOT call generatePdf when html is missing', () => {
      const params = makeParams({
        result: makeResult({ html_report: undefined as unknown as string }),
      })
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).not.toHaveBeenCalled()
    })

    it('does NOT call generatePdf while async generation is already in flight', () => {
      const params = makeParams({
        isPdfGenerating: true,
        result: makeResult({
          updated_at: '2026-01-15T12:00:00.000Z',
          pdf_generated_at: null,
        }),
      })
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).not.toHaveBeenCalled()
    })
  })

  describe('mobile fullscreen', () => {
    it('opens the fullscreen modal on mobile when html is present', () => {
      const params = makeParams({ isMobile: true })
      renderHook(() => useResultToReportBridge(params))
      expect(params.setShowFullscreenModal).toHaveBeenCalledWith(true)
    })

    it('does NOT open the fullscreen modal on desktop', () => {
      const params = makeParams({ isMobile: false })
      renderHook(() => useResultToReportBridge(params))
      expect(params.setShowFullscreenModal).not.toHaveBeenCalled()
    })

    it('does NOT open the fullscreen modal on mobile when html is missing', () => {
      const params = makeParams({
        isMobile: true,
        result: makeResult({ html_report: undefined as unknown as string }),
      })
      renderHook(() => useResultToReportBridge(params))
      expect(params.setShowFullscreenModal).not.toHaveBeenCalled()
    })
  })

  describe('preserved behaviours (Phase 4c.2 product calls)', () => {
    it('ignores callback identity churn but uses the latest callbacks on the next result', () => {
      const initialParams = makeParams({ canDownloadPdf: false })
      const { rerender } = renderHook(
        (p: UseResultToReportBridgeParams) => useResultToReportBridge(p),
        { initialProps: initialParams }
      )
      vi.clearAllMocks()

      const nextCallbacks = {
        onComplete: vi.fn(),
        setReport: vi.fn(),
        setRightPanelView: vi.fn(),
        setShowFullscreenModal: vi.fn(),
        tReport: vi.fn((key: string) => `next:${key}`),
      }

      rerender({
        ...initialParams,
        ...nextCallbacks,
      })

      expect(initialParams.onComplete).not.toHaveBeenCalled()
      expect(nextCallbacks.onComplete).not.toHaveBeenCalled()
      expect(nextCallbacks.setReport).not.toHaveBeenCalled()

      // Producers set the new result first and then announce it (see announceNewResult).
      const nextResult = makeResult({ valuation_id: 'val_next' })
      rerender({
        ...initialParams,
        ...nextCallbacks,
        result: nextResult,
      })
      expect(nextCallbacks.setReport).toHaveBeenCalledTimes(1)
      act(() => {
        useManualResultsStore.getState().announceNewResult()
      })

      expect(initialParams.onComplete).not.toHaveBeenCalled()
      expect(nextCallbacks.onComplete).toHaveBeenCalledWith(nextResult)
      expect(nextCallbacks.setRightPanelView).toHaveBeenCalledWith('preview')
    })

    it('switches to "preview" again when a new result is produced (calculation, version)', () => {
      const initialParams = makeParams()
      const { rerender } = renderHook(
        (p: UseResultToReportBridgeParams) => useResultToReportBridge(p),
        { initialProps: initialParams }
      )
      // First arrival.
      expect(initialParams.setRightPanelView).toHaveBeenCalledWith('preview')

      // A newly produced result announces itself again.
      const next = makeParams({
        result: makeResult({ valuation_id: 'val_next' }),
        setRightPanelView: vi.fn(),
      })
      rerender(next)
      expect(next.setRightPanelView).not.toHaveBeenCalled()
      act(() => {
        useManualResultsStore.getState().announceNewResult()
      })
      expect(next.setRightPanelView).toHaveBeenCalledWith('preview')
    })

    it('does NOT call generatePdf again when poll merges produce a new result object with unchanged fingerprint', () => {
      const staleResult = makeResult({
        updated_at: '2026-01-15T12:00:00.000Z',
        pdf_generated_at: null,
        render_fingerprint: 'fp-1',
      })
      const params = makeParams({ result: staleResult })
      const { rerender } = renderHook(
        (p: UseResultToReportBridgeParams) => useResultToReportBridge(p),
        { initialProps: params }
      )
      expect(params.generatePdf).toHaveBeenCalledTimes(1)

      rerender({
        ...params,
        result: { ...staleResult, company_name: 'Renamed BV' },
      })
      expect(params.generatePdf).toHaveBeenCalledTimes(1)
    })

    it('fires generatePdf when stale fingerprint changes after a report update', () => {
      const params = makeParams({
        result: makeResult({
          updated_at: '2026-01-15T12:00:00.000Z',
          pdf_generated_at: null,
          render_fingerprint: 'fp-1',
        }),
      })
      const { rerender } = renderHook(
        (p: UseResultToReportBridgeParams) => useResultToReportBridge(p),
        { initialProps: params }
      )
      expect(params.generatePdf).toHaveBeenCalledTimes(1)

      rerender({
        ...params,
        result: makeResult({
          updated_at: '2026-01-16T12:00:00.000Z',
          pdf_generated_at: null,
          render_fingerprint: 'fp-2',
        }),
      })
      expect(params.generatePdf).toHaveBeenCalledTimes(2)
    })
  })

  // F-08: the advisor opens History (or the mobile report is closed) while the report is
  // saved, polled and its PDF generated. Each of those replaced `result` or changed a
  // presentation input, and every re-run used to switch back to Preview, re-open the mobile
  // report and fire onComplete again.
  describe('announcing a new result only once', () => {
    function renderAnnounced(overrides: Partial<UseResultToReportBridgeParams> = {}) {
      const params = makeParams({ isMobile: true, ...overrides })
      const view = renderHook((p: UseResultToReportBridgeParams) => useResultToReportBridge(p), {
        initialProps: params,
      })
      expect(params.setRightPanelView).toHaveBeenCalledTimes(1)
      expect(params.onComplete).toHaveBeenCalledTimes(1)
      return { params, ...view }
    }

    it('re-projects but does not re-announce when only presentation inputs change', () => {
      const { params, rerender } = renderAnnounced({
        result: makeResult({ updated_at: '2026-09-23T10:00:00.000Z', pdf_generated_at: null }),
      })

      rerender({ ...params, sessionHtmlReport: '<div>saved html</div>' })
      rerender({ ...params, sessionHtmlReport: '<div>saved html</div>', clientBlendedValue: 1234 })
      rerender({ ...params, clientBlendedValue: 1234, selectedMethod: 'ebitda_multiple' })
      rerender({ ...params, isPdfGenerating: true })
      rerender({ ...params, isPdfGenerating: false })

      expect(vi.mocked(params.setReport).mock.calls.length).toBeGreaterThan(1)
      expect(params.setRightPanelView).toHaveBeenCalledTimes(1)
      expect(params.onComplete).toHaveBeenCalledTimes(1)
      expect(params.setShowFullscreenModal).toHaveBeenCalledTimes(1)
    })

    it('treats a poll merge of the same report (new result object) as enrichment', () => {
      const { params, rerender } = renderAnnounced()

      rerender({
        ...params,
        result: { ...(params.result as ValuationResponse), pdf_url: 'https://x.test/r.pdf' },
      })

      expect(params.setReport).toHaveBeenCalledTimes(2)
      expect(params.setRightPanelView).toHaveBeenCalledTimes(1)
      expect(params.onComplete).toHaveBeenCalledTimes(1)
      expect(params.setShowFullscreenModal).toHaveBeenCalledTimes(1)
    })

    it('keeps the announcement when the route moves from the session key to the saved UUID', () => {
      const uuid = '2f1d5c3e-8b7a-4c1e-9d2f-6a5b4c3d2e1f'
      const { params, rerender } = renderAnnounced({ reportId: 'val_abc12345' })
      rememberSavedReportAlias({
        previousId: 'val_abc12345',
        response: { reportId: uuid, sessionKey: 'val_abc12345' } as SaveValuationResultResponse,
      })

      rerender({ ...params, reportId: uuid })

      expect(params.setRightPanelView).toHaveBeenCalledTimes(1)
      expect(params.onComplete).toHaveBeenCalledTimes(1)
    })

    it("announces another report's first result, not the one carried over from the last", () => {
      const { params, rerender } = renderAnnounced({ reportId: 'report-a' })

      // The route switched but report A's result is still on screen for a moment.
      rerender({ ...params, reportId: 'report-b' })
      expect(params.setRightPanelView).toHaveBeenCalledTimes(1)
      expect(params.onComplete).toHaveBeenCalledTimes(1)

      const reportBResult = makeResult({ valuation_id: 'val_report_b' })
      rerender({ ...params, reportId: 'report-b', result: reportBResult })
      expect(params.setRightPanelView).toHaveBeenCalledTimes(2)
      expect(params.onComplete).toHaveBeenLastCalledWith(reportBResult)
    })

    it('opens the mobile report once, when the announced result first has HTML', () => {
      const params = makeParams({
        isMobile: true,
        result: makeResult({ html_report: undefined as unknown as string }),
      })
      const { rerender } = renderHook(
        (p: UseResultToReportBridgeParams) => useResultToReportBridge(p),
        { initialProps: params }
      )
      expect(params.setShowFullscreenModal).not.toHaveBeenCalled()

      rerender({ ...params, sessionHtmlReport: '<div>recovered html</div>' })
      rerender({ ...params, sessionHtmlReport: '<div>recovered html v2</div>' })

      expect(params.setShowFullscreenModal).toHaveBeenCalledTimes(1)
    })

    it('ignores announcements made before it mounted', () => {
      act(() => {
        useManualResultsStore.getState().announceNewResult()
      })
      const { params, rerender } = renderAnnounced()

      rerender({ ...params, clientBlendedValue: 99 })

      expect(params.setRightPanelView).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('catches and logs mapper errors without crashing', () => {
      const failingTReport = vi.fn(() => {
        throw new Error('translator boom')
      })
      const params = makeParams({
        tReport: failingTReport as unknown as UseResultToReportBridgeParams['tReport'],
      })
      const before = params.setReport
      expect(() => renderHook(() => useResultToReportBridge(params))).not.toThrow()
      // The bridge should NOT have reached `setReport` after the error.
      expect(before).not.toHaveBeenCalled()
    })

    it('swallows 402 paywall errors from generatePdf silently', async () => {
      const params = makeParams({
        result: makeResult({
          updated_at: '2026-01-15T12:00:00.000Z',
          pdf_generated_at: null,
        }),
        generatePdf: vi.fn().mockRejectedValue(new APIError('paywall', 402)),
      })
      renderHook(() => useResultToReportBridge(params))
      await waitFor(() => expect(params.generatePdf).toHaveBeenCalled())
    })

    it('logs non-402 generatePdf errors but does not re-throw', async () => {
      const params = makeParams({
        result: makeResult({
          updated_at: '2026-01-15T12:00:00.000Z',
          pdf_generated_at: null,
        }),
        generatePdf: vi.fn().mockRejectedValue(new Error('boom')),
      })
      expect(() => renderHook(() => useResultToReportBridge(params))).not.toThrow()
      await waitFor(() => expect(params.generatePdf).toHaveBeenCalled())
    })
  })

  describe('mapper integration', () => {
    it('passes a mapped ValuationReportData with the route reportId into setReport', () => {
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))
      const mapped = (params.setReport as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(mapped.id).toBe('route-id')
      expect(mapped.companyName).toBe('Test BV')
      expect(mapped.ebitda).toBe(400_000)
    })
  })
})
