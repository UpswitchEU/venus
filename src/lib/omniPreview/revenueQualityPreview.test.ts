import { describe, expect, it } from 'vitest'
import { computeRevenueQualityPreview } from './revenueQualityPreview'

describe('computeRevenueQualityPreview', () => {
  it('derives recurring revenue and concentration exposure', () => {
    const out = computeRevenueQualityPreview({
      revenue: 1_000_000,
      revRecurringPct: 60,
      revTopClientConcentrationPct: 20,
      revContractBacklog: 300_000,
    })
    expect(out.estimatedRecurringRevenue).toBe(600_000)
    expect(out.topClientRevenueAtRisk).toBe(200_000)
    expect(out.backlogMonthsOfRevenue).toBeCloseTo((300_000 / 1_000_000) * 12)
  })
})
