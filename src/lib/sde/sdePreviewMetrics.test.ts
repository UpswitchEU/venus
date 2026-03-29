import { describe, expect, it } from 'vitest'
import {
  applyOwnerDependencyToSdeMultiple,
  computeOwnerSalaryEstimate,
  computeSdePreviewMetrics,
  isSdeOwnerCompensationSectionComplete,
  resolveActualOwnerAddback,
  selectBaseSdeMultiple,
} from './sdePreviewMetrics'

describe('computeOwnerSalaryEstimate', () => {
  it('caps at 120k and uses 15% of revenue below the cap', () => {
    expect(computeOwnerSalaryEstimate(1_000_000)).toBe(120_000)
    expect(computeOwnerSalaryEstimate(500_000)).toBe(75_000)
  })
})

describe('resolveActualOwnerAddback', () => {
  it('uses explicit positive add-back over estimate', () => {
    expect(resolveActualOwnerAddback(80_000, 1_000_000)).toEqual({
      addback: 80_000,
      source: 'input',
    })
  })
  it('falls back to estimate when add-back missing or non-positive', () => {
    expect(resolveActualOwnerAddback(undefined, 800_000)).toEqual({
      addback: 120_000,
      source: 'estimate',
    })
    expect(resolveActualOwnerAddback(0, 800_000)).toEqual({
      addback: 120_000,
      source: 'estimate',
    })
  })
})

describe('selectBaseSdeMultiple', () => {
  it('matches omni revenue bands', () => {
    expect(selectBaseSdeMultiple(400_000)).toBe(1.5)
    expect(selectBaseSdeMultiple(1_000_000)).toBe(2.0)
    expect(selectBaseSdeMultiple(3_000_000)).toBe(2.75)
  })
})

describe('applyOwnerDependencyToSdeMultiple', () => {
  it('applies haircuts by score', () => {
    expect(applyOwnerDependencyToSdeMultiple(2.0, 75)).toBeCloseTo(2.0 * 0.85)
    expect(applyOwnerDependencyToSdeMultiple(2.0, 55)).toBeCloseTo(2.0 * 0.92)
    expect(applyOwnerDependencyToSdeMultiple(2.0, 30)).toBe(2.0)
    expect(applyOwnerDependencyToSdeMultiple(2.0, undefined)).toBe(2.0)
  })
})

describe('computeSdePreviewMetrics', () => {
  it('matches omni SDE = EBITDA + add-back and EV = SDE × multiple', () => {
    const revenue = 1_000_000
    const ebitda = 200_000
    const ownerSalaryEstimate = Math.min(revenue * 0.15, 120_000)
    const sde = ebitda + ownerSalaryEstimate
    const m = selectBaseSdeMultiple(revenue)
    const out = computeSdePreviewMetrics({ revenue, ebitda })
    expect(out.available).toBe(true)
    expect(out.ownerSalaryEstimate).toBe(ownerSalaryEstimate)
    expect(out.actualAddback).toBe(ownerSalaryEstimate)
    expect(out.addbackSource).toBe('estimate')
    expect(out.sde).toBeCloseTo(sde)
    expect(out.baseSdeMultiple).toBe(m)
    expect(out.adjustedSdeMultiple).toBe(m)
    expect(out.impliedEnterpriseValue).toBeCloseTo(sde * m)
  })

  it('flags revenue above SDE cap', () => {
    const out = computeSdePreviewMetrics({ revenue: 6_000_000, ebitda: 500_000 })
    expect(out.available).toBe(false)
    expect(out.unavailableReason).toBe('revenue_cap')
  })

  it('flags non-positive EBITDA', () => {
    const out = computeSdePreviewMetrics({ revenue: 1_000_000, ebitda: 0 })
    expect(out.available).toBe(false)
    expect(out.unavailableReason).toBe('non_positive_ebitda')
  })
})

describe('isSdeOwnerCompensationSectionComplete', () => {
  it('completes on positive add-back even when preview unavailable', () => {
    const preview = computeSdePreviewMetrics({ revenue: 6_000_000, ebitda: 100_000 })
    expect(preview.available).toBe(false)
    expect(isSdeOwnerCompensationSectionComplete(50_000, preview)).toBe(true)
  })

  it('completes on available preview without add-back', () => {
    const preview = computeSdePreviewMetrics({ revenue: 1_000_000, ebitda: 100_000 })
    expect(isSdeOwnerCompensationSectionComplete(undefined, preview)).toBe(true)
  })
})
