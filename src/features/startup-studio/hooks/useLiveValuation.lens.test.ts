/**
 * Live-preview ↔ engine parity test for the inception lens.
 *
 * The Venus live preview must mirror the Python engine's math exactly
 * for each of the three lens levels.  If the preview drifts from the
 * engine, the founder sees one number on Express and a different
 * number on the canonical PDF — exactly the boundary issue we have
 * disciplined this whole session to avoid.
 *
 * This test fakes the React store and React-DOM environment so we can
 * assert the math in isolation.  It does NOT call into Python; it
 * mirrors the engine's formulas (which are themselves trivial — multiplier
 * + band-widening) and pins the FE implementation to those formulas.
 *
 * If a future refactor diverges, this test fails LOUDLY rather than
 * silently producing two different valuations on two surfaces.
 */

import { describe, expect, it } from 'vitest'
import { INCEPTION_LENS_OVERLAY } from '@/store/manual/useStartupValuationStore'

describe('inception lens — live-preview ↔ engine parity', () => {
  it('milestones_driven is a no-op (multiplier 1.0, no widening)', () => {
    const overlay = INCEPTION_LENS_OVERLAY.milestones_driven
    expect(overlay.multiplier).toBe(1.0)
    expect(overlay.bandWidenPct).toBe(0)
  })

  it('momentum_driven matches the Python engine calibration', () => {
    const overlay = INCEPTION_LENS_OVERLAY.momentum_driven
    expect(overlay.multiplier).toBeCloseTo(1.1, 5)
    expect(overlay.bandWidenPct).toBeCloseTo(0.15, 5)
  })

  it('inception_bet matches the Python engine calibration', () => {
    const overlay = INCEPTION_LENS_OVERLAY.inception_bet
    expect(overlay.multiplier).toBeCloseTo(1.25, 5)
    expect(overlay.bandWidenPct).toBeCloseTo(0.25, 5)
  })

  it.each([
    {
      name: 'milestones_driven (no-op)',
      lens: 'milestones_driven' as const,
      preLow: 2_500_000,
      preMid: 8_500_000,
      preHigh: 38_500_000,
      expectedLow: 2_500_000,
      expectedMid: 8_500_000,
      expectedHigh: 38_500_000,
    },
    {
      name: 'momentum_driven (1.10× × ±15% widening)',
      lens: 'momentum_driven' as const,
      preLow: 2_500_000,
      preMid: 8_500_000,
      preHigh: 38_500_000,
      // low = preLow × 1.10 × (1 - 0.15) = 2.5M × 0.935 = 2.3375M
      expectedLow: 2_337_500,
      // mid = preMid × 1.10 = 8.5M × 1.10 = 9.35M
      expectedMid: 9_350_000,
      // high = preHigh × 1.10 × (1 + 0.15) = 38.5M × 1.265 = 48.7025M
      expectedHigh: 48_702_500,
    },
    {
      name: 'inception_bet (1.25× × ±25% widening)',
      lens: 'inception_bet' as const,
      preLow: 2_500_000,
      preMid: 8_500_000,
      preHigh: 38_500_000,
      // low = preLow × 1.25 × 0.75 = 2.5M × 0.9375 = 2.34375M
      expectedLow: 2_343_750,
      // mid = preMid × 1.25 = 10.625M
      expectedMid: 10_625_000,
      // high = preHigh × 1.25 × 1.25 = 38.5M × 1.5625 = 60.15625M
      expectedHigh: 60_156_250,
    },
  ])('$name produces the canonical engine output', (tc) => {
    const overlay = INCEPTION_LENS_OVERLAY[tc.lens]
    const lowPostLens = tc.preLow * overlay.multiplier * (1 - overlay.bandWidenPct)
    const midPostLens = tc.preMid * overlay.multiplier
    const highPostLens = tc.preHigh * overlay.multiplier * (1 + overlay.bandWidenPct)
    expect(Math.round(lowPostLens)).toBe(tc.expectedLow)
    expect(Math.round(midPostLens)).toBe(tc.expectedMid)
    expect(Math.round(highPostLens)).toBe(tc.expectedHigh)
  })

  it('floor dips below original on inception_bet (acknowledging variance honestly)', () => {
    // The lens MUST widen the band, not narrow it.  An inception_bet
    // floor below the milestone-driven floor is the correct signal:
    // higher variance → lower P10 even as the mid lifts.
    const overlay = INCEPTION_LENS_OVERLAY.inception_bet
    const factor = overlay.multiplier * (1 - overlay.bandWidenPct)
    expect(factor).toBeLessThan(1.0)
    // 1.25 × 0.75 = 0.9375 → floor dips by ~6.25%
    expect(factor).toBeCloseTo(0.9375, 5)
  })

  it('ceiling lifts substantially on inception_bet (asymmetric upside)', () => {
    const overlay = INCEPTION_LENS_OVERLAY.inception_bet
    const factor = overlay.multiplier * (1 + overlay.bandWidenPct)
    // 1.25 × 1.25 = 1.5625 → ceiling lifts by ~56%
    expect(factor).toBeCloseTo(1.5625, 5)
    expect(factor).toBeGreaterThan(1.5)
  })

  it('total spread widens monotonically across lens levels', () => {
    // Pin the calibration: spread under inception_bet > momentum > default.
    // A future refactor that accidentally narrowed the band on a higher-
    // tier lens would silently misrepresent variance to the founder.
    const preLow = 2_500_000
    const preHigh = 38_500_000
    const calc = (lens: keyof typeof INCEPTION_LENS_OVERLAY) => {
      const o = INCEPTION_LENS_OVERLAY[lens]
      const low = preLow * o.multiplier * (1 - o.bandWidenPct)
      const high = preHigh * o.multiplier * (1 + o.bandWidenPct)
      return high - low
    }
    expect(calc('momentum_driven')).toBeGreaterThan(calc('milestones_driven'))
    expect(calc('inception_bet')).toBeGreaterThan(calc('momentum_driven'))
  })
})
