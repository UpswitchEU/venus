import { describe, expect, it } from 'vitest'
import type { BusinessTypeSegmentInput } from '../../../types/valuation'
import {
  blendedSegmentMultiple,
  equalSegmentWeights,
  multipleLabelForBasis,
  rebalanceSegmentWeights,
  resolveSegmentWeightRows,
  totalSegmentWeight,
} from './segmentWeightingModel'

describe('segmentWeightingModel', () => {
  describe('multipleLabelForBasis', () => {
    it('maps the engine basis vocabulary to market labels', () => {
      expect(multipleLabelForBasis('EBITDA')).toBe('EV/EBITDA')
      expect(multipleLabelForBasis('Revenue')).toBe('EV/Revenue')
      expect(multipleLabelForBasis('omzet')).toBe('EV/Revenue')
      expect(multipleLabelForBasis('EBIT')).toBe('EV/EBIT')
      expect(multipleLabelForBasis('SDE')).toBe('SDE')
      expect(multipleLabelForBasis('ARR')).toBe('EV/ARR')
      expect(multipleLabelForBasis('')).toBeUndefined()
      expect(multipleLabelForBasis(null)).toBeUndefined()
    })
  })

  describe('equalSegmentWeights', () => {
    it('always sums to exactly 100, pushing the remainder to the front', () => {
      expect(equalSegmentWeights(1)).toEqual([100])
      expect(equalSegmentWeights(2)).toEqual([50, 50])
      expect(equalSegmentWeights(3)).toEqual([34, 33, 33])
      expect(equalSegmentWeights(3).reduce((a, b) => a + b, 0)).toBe(100)
      expect(equalSegmentWeights(0)).toEqual([])
    })
  })

  describe('rebalanceSegmentWeights', () => {
    it('keeps the total at exactly 100 after a change', () => {
      const next = rebalanceSegmentWeights([50, 50], 0, 70)
      expect(next).toEqual([70, 30])
      expect(next.reduce((a, b) => a + b, 0)).toBe(100)
    })

    it('distributes the remainder proportionally across the others', () => {
      // others were 30 and 10 (ratio 3:1); 60 remaining → 45 / 15
      const next = rebalanceSegmentWeights([60, 30, 10], 0, 40)
      expect(next[0]).toBe(40)
      expect(next.reduce((a, b) => a + b, 0)).toBe(100)
      expect(next[1]).toBeGreaterThan(next[2])
    })

    it('falls back to an equal split when the others are all zero', () => {
      const next = rebalanceSegmentWeights([100, 0, 0], 0, 40)
      expect(next[0]).toBe(40)
      expect(next.reduce((a, b) => a + b, 0)).toBe(100)
      expect(next[1]).toBe(next[2]) // 30 / 30
    })

    it('clamps out-of-range input and collapses a single segment to 100', () => {
      expect(rebalanceSegmentWeights([50, 50], 0, 250)).toEqual([100, 0])
      expect(rebalanceSegmentWeights([50, 50], 0, -10)).toEqual([0, 100])
      expect(rebalanceSegmentWeights([100], 0, 40)).toEqual([100])
    })
  })

  describe('resolveSegmentWeightRows', () => {
    const segments: BusinessTypeSegmentInput[] = [
      {
        business_type_id: 'auto',
        business_type_title: 'Auto parts',
        basis: 'EBITDA',
        multiple: 3.5,
        weight: 60,
      },
      {
        business_type_id: 'acc',
        business_type_title: 'Accounting',
        basis: 'EBITDA',
        multiple: 5.5,
        weight: 40,
      },
    ]

    it('reads stored weights and resolves the basis label + multiple', () => {
      const rows = resolveSegmentWeightRows(segments)
      expect(rows[0]).toMatchObject({
        title: 'Auto parts',
        multipleLabel: 'EV/EBITDA',
        multiple: 3.5,
        weight: 60,
      })
      expect(rows[1].weight).toBe(40)
    })

    it('falls back to an equal split when no segment carries a weight', () => {
      const rows = resolveSegmentWeightRows(segments.map((s) => ({ ...s, weight: null })))
      expect(rows.map((r) => r.weight)).toEqual([50, 50])
    })
  })

  describe('blendedSegmentMultiple', () => {
    it('computes Σ(weight/100 × multiple) when every segment has a multiple', () => {
      const rows = resolveSegmentWeightRows([
        { business_type_id: 'a', basis: 'EBITDA', multiple: 4, weight: 50 },
        { business_type_id: 'b', basis: 'EBITDA', multiple: 6, weight: 50 },
      ])
      expect(blendedSegmentMultiple(rows)).toBe(5)
    })

    it('returns undefined when any segment is missing a multiple', () => {
      const rows = resolveSegmentWeightRows([
        { business_type_id: 'a', basis: 'EBITDA', multiple: 4, weight: 50 },
        { business_type_id: 'b', basis: 'EBITDA', weight: 50 },
      ])
      expect(blendedSegmentMultiple(rows)).toBeUndefined()
    })
  })

  describe('totalSegmentWeight', () => {
    it('sums the row weights', () => {
      const rows = resolveSegmentWeightRows([
        { business_type_id: 'a', weight: 70 },
        { business_type_id: 'b', weight: 30 },
      ])
      expect(totalSegmentWeight(rows)).toBe(100)
    })
  })
})
