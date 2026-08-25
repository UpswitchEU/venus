import { describe, expect, it } from 'vitest'
import {
  computeSdePreviewMetrics,
  isSdeOwnerCompensationSectionComplete,
} from './sdePreviewMetrics'

describe('computeSdePreviewMetrics', () => {
  it('reports input eligibility without calculating a monetary value', () => {
    const out = computeSdePreviewMetrics({ revenue: 1_000_000, ebitda: 200_000 })

    expect(out).toEqual({ available: true })
    expect(out).not.toHaveProperty('sde')
    expect(out).not.toHaveProperty('baseSdeMultiple')
    expect(out).not.toHaveProperty('impliedEnterpriseValue')
  })

  it('flags revenue above the SDE cap', () => {
    expect(computeSdePreviewMetrics({ revenue: 6_000_000, ebitda: 500_000 })).toEqual({
      available: false,
      unavailableReason: 'revenue_cap',
    })
  })

  it('flags non-positive EBITDA', () => {
    expect(computeSdePreviewMetrics({ revenue: 1_000_000, ebitda: 0 })).toEqual({
      available: false,
      unavailableReason: 'non_positive_ebitda',
    })
  })
})

describe('isSdeOwnerCompensationSectionComplete', () => {
  it('completes on a positive source input even when engine eligibility is unavailable', () => {
    const eligibility = computeSdePreviewMetrics({ revenue: 6_000_000, ebitda: 100_000 })
    expect(isSdeOwnerCompensationSectionComplete(50_000, eligibility)).toBe(true)
  })

  it('completes when ValuationIQ has eligible financial inputs', () => {
    const eligibility = computeSdePreviewMetrics({ revenue: 1_000_000, ebitda: 100_000 })
    expect(isSdeOwnerCompensationSectionComplete(undefined, eligibility)).toBe(true)
  })
})
