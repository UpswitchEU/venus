import { describe, it, expect } from 'vitest'

import { projectOntoGauge } from '../PercentileBandGauge'

describe('projectOntoGauge', () => {
  it('maps the lower bound to 0 and the upper bound to 1', () => {
    expect(projectOntoGauge(2, 2, 10)).toEqual({ clamped: 0, outOfRange: false })
    expect(projectOntoGauge(10, 2, 10)).toEqual({ clamped: 1, outOfRange: false })
  })

  it('maps the midpoint to 0.5', () => {
    expect(projectOntoGauge(6, 2, 10).clamped).toBe(0.5)
  })

  it('flags out-of-range values and clamps them to the nearest edge', () => {
    expect(projectOntoGauge(1, 2, 10)).toEqual({ clamped: 0, outOfRange: true })
    expect(projectOntoGauge(20, 2, 10)).toEqual({ clamped: 1, outOfRange: true })
  })

  it('returns outOfRange=true for non-finite inputs', () => {
    expect(projectOntoGauge(NaN, 2, 10).outOfRange).toBe(true)
    expect(projectOntoGauge(5, NaN, 10).outOfRange).toBe(true)
    expect(projectOntoGauge(5, 2, Infinity).outOfRange).toBe(true)
  })

  it('returns outOfRange=true when domainMax <= domainMin', () => {
    expect(projectOntoGauge(5, 5, 5).outOfRange).toBe(true)
    expect(projectOntoGauge(5, 10, 2).outOfRange).toBe(true)
  })

  it('handles non-integer domains without rounding drift', () => {
    // 4.875 between 0.5 and 9.25 → (4.875 − 0.5) / (9.25 − 0.5) = 4.375 / 8.75 = 0.5
    expect(projectOntoGauge(4.875, 0.5, 9.25).clamped).toBe(0.5)
  })
})
