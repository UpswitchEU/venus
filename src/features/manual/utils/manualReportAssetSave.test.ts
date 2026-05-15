// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import {
  type SaveManualCalculationReportAssetsDeps,
  saveManualCalculationReportAssets,
} from './manualReportAssetSave'

function valuationResult(): ValuationResponse {
  return {
    success: true,
    html_report: '<main>report</main>',
  } as ValuationResponse
}

function deps(
  overrides: Partial<SaveManualCalculationReportAssetsDeps> = {}
): SaveManualCalculationReportAssetsDeps {
  return {
    saveReportAssets: vi.fn().mockResolvedValue(undefined),
    markSaved: vi.fn(),
    ...overrides,
  }
}

describe('saveManualCalculationReportAssets', () => {
  it('treats missing report id as already durable', async () => {
    const d = deps()

    const result = await saveManualCalculationReportAssets({
      reportId: null,
      sessionData: {},
      request: {},
      taxLatencyItems: [],
      valuationResult: valuationResult(),
      dirtyVersion: 7,
      isStillTarget: () => true,
      deps: d,
    })

    expect(result).toEqual({ aborted: false, durableSaveSucceeded: true })
    expect(d.saveReportAssets).not.toHaveBeenCalled()
    expect(d.markSaved).not.toHaveBeenCalled()
  })

  it('saves report assets and marks the session clean on success', async () => {
    const d = deps()

    const result = await saveManualCalculationReportAssets({
      reportId: 'report-1',
      sessionData: { company_name: 'Acme' },
      request: { current_year_data: { year: 2025, revenue: 100, ebitda: 10 } },
      taxLatencyItems: [{ id: 'tax-1' }],
      valuationResult: valuationResult(),
      name: 'Acme valuation',
      dirtyVersion: 7,
      isStillTarget: () => true,
      deps: d,
    })

    expect(result).toEqual({ aborted: false, durableSaveSucceeded: true })
    expect(d.saveReportAssets).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        valuationResult: expect.objectContaining({ success: true }),
        htmlReport: '<main>report</main>',
        name: 'Acme valuation',
      })
    )
    expect(d.markSaved).toHaveBeenCalledWith(7)
  })

  it('returns save errors without marking the session clean', async () => {
    const saveError = new Error('save failed')
    const d = deps({ saveReportAssets: vi.fn().mockRejectedValue(saveError) })

    const result = await saveManualCalculationReportAssets({
      reportId: 'report-1',
      sessionData: {},
      request: {},
      taxLatencyItems: [],
      valuationResult: valuationResult(),
      dirtyVersion: 7,
      isStillTarget: () => true,
      deps: d,
    })

    expect(result).toEqual({
      aborted: false,
      durableSaveSucceeded: false,
      saveError,
    })
    expect(d.markSaved).not.toHaveBeenCalled()
  })

  it('aborts after save when the active target changed', async () => {
    const d = deps()

    const result = await saveManualCalculationReportAssets({
      reportId: 'report-1',
      sessionData: {},
      request: {},
      taxLatencyItems: [],
      valuationResult: valuationResult(),
      dirtyVersion: 7,
      isStillTarget: () => false,
      deps: d,
    })

    expect(result).toEqual({ aborted: true, durableSaveSucceeded: false })
    expect(d.saveReportAssets).toHaveBeenCalled()
    expect(d.markSaved).not.toHaveBeenCalled()
  })
})
