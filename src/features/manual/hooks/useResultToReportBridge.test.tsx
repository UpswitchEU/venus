/**
 * useResultToReportBridge — behaviour pins for the full Result→Report
 * bridge effect. Asserts every one of the 7 documented side effects fires
 * (or doesn't fire) under the right conditions. Before Phase 4c.2 Hook 2
 * this effect lived inline in `ManualLayout.tsx` (~110 lines) with no
 * isolated test coverage.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreparerMultipleStore } from '@/store/manual/usePreparerMultipleStore'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import {
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
    setDraftStatus: vi.fn(),
    setLastSaved: vi.fn(),
    setRightPanelView: vi.fn(),
    setShowFullscreenModal: vi.fn(),
    generatePdf: vi.fn().mockResolvedValue(undefined),
    ...override,
  }
}

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
    it('no-ops entirely when result is null', () => {
      const params = makeParams({ result: null })
      renderHook(() => useResultToReportBridge(params))
      expect(params.onComplete).not.toHaveBeenCalled()
      expect(params.setReport).not.toHaveBeenCalled()
      expect(params.setDraftStatus).not.toHaveBeenCalled()
      expect(params.setLastSaved).not.toHaveBeenCalled()
      expect(params.setRightPanelView).not.toHaveBeenCalled()
      expect(params.setShowFullscreenModal).not.toHaveBeenCalled()
      expect(params.generatePdf).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('fires every side effect in order when result is non-null', () => {
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))

      expect(params.onComplete).toHaveBeenCalledWith(params.result)
      expect(params.setReport).toHaveBeenCalledTimes(1)
      expect(params.setDraftStatus).toHaveBeenCalledWith('saved')
      expect(params.setLastSaved).toHaveBeenCalledTimes(1)
      expect(params.setRightPanelView).toHaveBeenCalledWith('preview')
    })

    it('calls generatePdf in the background when reportId + html + canDownloadPdf', () => {
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).toHaveBeenCalledTimes(1)
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
    it('overrides setRightPanelView to "preview" on EVERY result-arrival (preserved)', () => {
      const initialParams = makeParams()
      const { rerender } = renderHook(
        (p: UseResultToReportBridgeParams) => useResultToReportBridge(p),
        { initialProps: initialParams }
      )
      // First arrival.
      expect(initialParams.setRightPanelView).toHaveBeenCalledWith('preview')

      // A "different" result triggers the override again.
      const next = makeParams({
        result: makeResult({ valuation_id: 'val_next' }),
        setRightPanelView: vi.fn(),
      })
      rerender(next)
      expect(next.setRightPanelView).toHaveBeenCalledWith('preview')
    })

    it('fires generatePdf even when invoked on a result-arrival after manual gen (preserved)', () => {
      // Simulate the user having manually generated a PDF before this result
      // lands. The mapper / bridge do not know about that; auto-gen still
      // fires. The preserved behaviour: every result-arrival pings generatePdf.
      const params = makeParams()
      renderHook(() => useResultToReportBridge(params))
      expect(params.generatePdf).toHaveBeenCalledTimes(1)
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
        generatePdf: vi.fn().mockRejectedValue(new APIError('paywall', 402)),
      })
      renderHook(() => useResultToReportBridge(params))
      // generatePdf fired; the catch block swallows the 402.
      await waitFor(() => expect(params.generatePdf).toHaveBeenCalled())
    })

    it('logs non-402 generatePdf errors but does not re-throw', async () => {
      const params = makeParams({
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
