import { describe, expect, it } from 'vitest'
import type { BusinessTypeSegmentInput } from '../../../types/valuation/request'
import { computeSegmentWeightedMultiple } from './segmentWeightedMultiple'

const segment = (over: Partial<BusinessTypeSegmentInput>): BusinessTypeSegmentInput => ({
  business_type_id: 'bt',
  ...over,
})

describe('computeSegmentWeightedMultiple', () => {
  it('returns null for fewer than two segments', () => {
    expect(computeSegmentWeightedMultiple(undefined)).toBeNull()
    expect(computeSegmentWeightedMultiple([])).toBeNull()
    expect(computeSegmentWeightedMultiple([segment({ applied_multiple: 6, weight: 1 })])).toBeNull()
  })

  it('blends two segments by weight using applied_multiple', () => {
    const result = computeSegmentWeightedMultiple([
      segment({ applied_multiple: 6, weight: 70 }),
      segment({ applied_multiple: 4, weight: 30 }),
    ])
    // 6*0.7 + 4*0.3 = 5.4
    expect(result).toBeCloseTo(5.4, 5)
  })

  it('renormalises weights against segments that carry a usable multiple', () => {
    const result = computeSegmentWeightedMultiple([
      segment({ applied_multiple: 8, weight: 50 }),
      segment({ multiple: null, weight: 50 }), // dropped — no multiple
      segment({ applied_multiple: 4, weight: 50 }),
    ])
    // only the 8x and 4x legs remain; equal renormalised weights → 6
    expect(result).toBeCloseTo(6, 5)
  })

  it('falls back to multiple when applied_multiple is absent', () => {
    const result = computeSegmentWeightedMultiple([
      segment({ multiple: 10, weight: 50 }),
      segment({ multiple: 6, weight: 50 }),
    ])
    expect(result).toBeCloseTo(8, 5)
  })

  it('uses an equal-weight blend when no usable weights are present', () => {
    const result = computeSegmentWeightedMultiple([
      segment({ applied_multiple: 9 }),
      segment({ applied_multiple: 3 }),
    ])
    expect(result).toBeCloseTo(6, 5)
  })

  it('coerces numeric strings from form inputs', () => {
    const result = computeSegmentWeightedMultiple([
      segment({ applied_multiple: '5', weight: '60' }),
      segment({ applied_multiple: '10', weight: '40' }),
    ])
    // 5*0.6 + 10*0.4 = 7
    expect(result).toBeCloseTo(7, 5)
  })
})
