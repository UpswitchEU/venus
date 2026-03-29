import { describe, expect, it } from 'vitest'
import { computeEbitdaMarginPct } from './marketBasicsPreview'

describe('computeEbitdaMarginPct', () => {
  it('returns null when revenue is missing or non-positive', () => {
    expect(computeEbitdaMarginPct(undefined, 100)).toBeNull()
    expect(computeEbitdaMarginPct(0, 100)).toBeNull()
  })

  it('returns EBITDA / revenue as percent', () => {
    expect(computeEbitdaMarginPct(1_000_000, 200_000)).toBeCloseTo(20)
  })
})
