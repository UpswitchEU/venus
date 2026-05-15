// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualLiveMultiplePreview } from './manualLiveMultiplePreview'

describe('manualLiveMultiplePreview', () => {
  it('builds a live equity preview from result details and balance-sheet adjustments', () => {
    expect(
      buildManualLiveMultiplePreview({
        report: { htmlReport: '<main>report</main>', valuation: 470_000 },
        methodAcceptsOverride: true,
        appliedMedian: 5.5,
        benchmarkMedian: 4.5,
        result: {
          details: {
            sustainable_ebitda: 100_000,
            net_debt: 50_000,
            balance_sheet_adjustments: [{ amount: 10_000 }, { value: -5_000 }],
          },
        },
      })
    ).toEqual({
      previewEquity: 505_000,
      delta: 35_000,
      appliedMultiple: 5.5,
      benchmarkMultiple: 4.5,
    })
  })

  it('falls back to top-level result values when details are absent', () => {
    expect(
      buildManualLiveMultiplePreview({
        report: { htmlReport: '<main>report</main>' },
        methodAcceptsOverride: true,
        appliedMedian: 6,
        benchmarkMedian: null,
        result: {
          ebitda: 80_000,
          net_debt: 20_000,
          balance_sheet_adjustments: 5_000,
          equity_value_mid: 400_000,
          multiples_valuation: { ebitda_multiple: 5 },
        },
      })
    ).toMatchObject({
      previewEquity: 465_000,
      delta: 65_000,
      benchmarkMultiple: 5,
    })
  })

  it('returns null when preview inputs are not actionable', () => {
    const base = {
      result: { ebitda: 100_000 },
      report: { htmlReport: '<main>report</main>' },
      methodAcceptsOverride: true,
      appliedMedian: 5,
      benchmarkMedian: 4,
    }

    expect(buildManualLiveMultiplePreview({ ...base, report: null })).toBeNull()
    expect(buildManualLiveMultiplePreview({ ...base, methodAcceptsOverride: false })).toBeNull()
    expect(buildManualLiveMultiplePreview({ ...base, appliedMedian: null })).toBeNull()
    expect(buildManualLiveMultiplePreview({ ...base, benchmarkMedian: 4.996 })).toBeNull()
    expect(buildManualLiveMultiplePreview({ ...base, result: { ebitda: 0 } })).toBeNull()
  })
})
