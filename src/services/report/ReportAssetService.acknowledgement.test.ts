import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resetManualValuationSaveReceiptsForTests,
  wasManualValuationSavedThisVisit,
} from '../../features/manual/utils/manualValuationSaveReceipt'
import type { ValuationResponse } from '../../types/valuation'
import { failedReportAssetSave, ReportAssetService } from './ReportAssetService'

const { saveValuationResult } = vi.hoisted(() => ({ saveValuationResult: vi.fn() }))
vi.mock('../api/session/SessionAPI', () => ({
  SessionAPI: class {
    saveValuationResult = saveValuationResult
  },
}))

describe('ReportAssetService acknowledgement', () => {
  afterEach(() => {
    vi.clearAllMocks()
    resetManualValuationSaveReceiptsForTests()
  })

  it.each([
    undefined,
    { success: false },
  ])('retains the failed payload without recording a saved receipt for %j', async (response) => {
    saveValuationResult.mockResolvedValue(response)
    const reportId = `report-unacknowledged-${response ? 'false' : 'empty'}`
    const valuationResult = { equity_value_mid: 907614.48 } as ValuationResponse
    await expect(
      ReportAssetService.getInstance().saveReportAssets(reportId, { valuationResult })
    ).rejects.toThrow('not acknowledged')
    expect(failedReportAssetSave(reportId)?.assets.valuationResult).toEqual(valuationResult)
    expect(wasManualValuationSavedThisVisit(reportId)).toBe(false)
  })
})
