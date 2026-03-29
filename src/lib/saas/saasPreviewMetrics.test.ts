import { describe, expect, it } from 'vitest'
import {
  computeNrrExpansionSpreadPct,
  computeSaasPreviewMetrics,
  effectiveMonthlyRevenueForPayback,
} from './saasPreviewMetrics'

describe('saasPreviewMetrics', () => {
  it('matches engine-style CAC payback when only ARR is set', () => {
    const m = computeSaasPreviewMetrics({
      saasArr: 500_000,
      saasCac: 1500,
      saasGrossMarginPct: 78,
    })
    const monthly = 500_000 / 12
    const expected = 1500 / (monthly * 0.78)
    expect(m.cacPaybackMonths).toBeCloseTo(expected, 8)
  })

  it('prefers MRR over ARR/12 when both present', () => {
    expect(effectiveMonthlyRevenueForPayback(500_000, 42_000)).toBe(42_000)
  })

  it('computes NRR expansion spread in percentage points', () => {
    expect(computeNrrExpansionSpreadPct(110, 5)).toBeCloseTo(15, 5)
  })
})
