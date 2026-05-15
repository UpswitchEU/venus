// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { shouldBlockExtremePreparerMultiple } from './manualPreparerMultipleGuard'

describe('shouldBlockExtremePreparerMultiple', () => {
  it('blocks unacknowledged overrides above the high benchmark band', () => {
    expect(
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: 5,
          appliedMedian: 10,
          reasonKey: 'strategic_buyer_premium',
          acknowledgedExtreme: false,
        },
        { p90_ebitda_multiple: 6 }
      )
    ).toBe(true)
  })

  it('allows extreme overrides after acknowledgement', () => {
    expect(
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: 5,
          appliedMedian: 10,
          reasonKey: 'strategic_buyer_premium',
          acknowledgedExtreme: true,
        },
        { p90_ebitda_multiple: 6 }
      )
    ).toBe(false)
  })

  it('does not block unchanged or missing-reason overrides', () => {
    expect(
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: 5,
          appliedMedian: 5.004,
          reasonKey: 'strategic_buyer_premium',
          acknowledgedExtreme: false,
        },
        { p90_ebitda_multiple: 6 }
      )
    ).toBe(false)

    expect(
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: 5,
          appliedMedian: 10,
          reasonKey: '',
          acknowledgedExtreme: false,
        },
        { p90_ebitda_multiple: 6 }
      )
    ).toBe(false)
  })

  it('uses the baseline fallback when percentile bands are unavailable', () => {
    expect(
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: 5,
          appliedMedian: 13,
          reasonKey: 'strategic_buyer_premium',
          acknowledgedExtreme: false,
        },
        null
      )
    ).toBe(true)
  })
})
