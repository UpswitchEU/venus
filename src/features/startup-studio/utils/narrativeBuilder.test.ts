import { describe, expect, it } from 'vitest'
import {
  buildHeadlineNarrative,
  buildWhyNarrative,
  computeY5Sensitivity,
  type NarrativeContext,
} from './narrativeBuilder'

const upswitchCtx: NarrativeContext = {
  preMoney: 8_556_824,
  raise: 1_500_000,
  prePedigreeMid: 6_338_388,
  pedigreeMultiplier: 1.35,
  legs: {
    berkus: 1_950_000,
    scorecard: 1_837_500,
    vc: 28_500_000,
    saasForward: null,
  },
  stage: 'pre_seed',
  sector: 'marketplace',
  countryCode: 'BE',
  team: 'veteran',
  ambition: 'ambitious',
  year5Revenue: 60_000_000,
}

describe('buildHeadlineNarrative', () => {
  it('produces the deck-ready one-liner for the Upswitch demo', () => {
    const sentence = buildHeadlineNarrative(upswitchCtx, 'en')
    expect(sentence).toContain('€8.6M pre-money')
    expect(sentence).toContain('€1.5M')
    expect(sentence).toContain('€10.1M')
    expect(sentence).toContain('15%')
    expect(sentence).toContain('pre-seed')
    expect(sentence).toContain('marketplace')
    expect(sentence).toContain('BE')
  })

  it('localises to Dutch', () => {
    const sentence = buildHeadlineNarrative(upswitchCtx, 'nl')
    expect(sentence).toContain('pre-money')
    expect(sentence).toContain('ophalen')
    expect(sentence).toContain('post-money')
    expect(sentence).toContain('dilutie')
  })

  it('rounds dilution to integer percent', () => {
    // €1.5M raise on €8.5M pre = 14.97% — must render as 15%, not 14.97%
    const sentence = buildHeadlineNarrative(upswitchCtx, 'en')
    expect(sentence).toMatch(/~15%/)
    expect(sentence).not.toMatch(/14\.97/)
  })
})

describe('buildWhyNarrative', () => {
  it('returns two paragraphs with no jargon (no "Berkus" / "Scorecard")', () => {
    // The whole point of the plain-English narrative is to NOT use the
    // method names a non-finance owner would Google.
    const paragraphs = buildWhyNarrative(upswitchCtx, 'en')
    expect(paragraphs).toHaveLength(2)
    const text = paragraphs.join(' ').toLowerCase()
    expect(text).not.toContain('berkus')
    expect(text).not.toContain('scorecard')
    expect(text).not.toContain('sahlman')
    // Should mention triangulation across N methods (transparency)
    expect(paragraphs[1]).toMatch(/[3-4] (academic|peer-reviewed)/)
  })

  it('mentions the team profile and ambition in plain language', () => {
    const paragraphs = buildWhyNarrative(upswitchCtx, 'en')
    expect(paragraphs[0]).toContain('veteran')
    expect(paragraphs[0]).toContain('category-defining')
  })

  it('surfaces pedigree direction (lift / discount)', () => {
    const lifted = buildWhyNarrative(upswitchCtx, 'en').join(' ')
    expect(lifted).toContain('lift')
    expect(lifted).toContain('1.35×')

    const penaltyCtx: NarrativeContext = {
      ...upswitchCtx,
      pedigreeMultiplier: 0.8,
      team: 'first_time',
    }
    const discounted = buildWhyNarrative(penaltyCtx, 'en').join(' ')
    expect(discounted).toContain('discount')
  })

  it('omits pedigree clause when multiplier is exactly 1.0', () => {
    const neutral: NarrativeContext = { ...upswitchCtx, pedigreeMultiplier: 1.0 }
    const text = buildWhyNarrative(neutral, 'en').join(' ')
    expect(text).not.toContain('lift')
    expect(text).not.toContain('discount')
  })
})

describe('computeY5Sensitivity', () => {
  it('produces a symmetric band around mid', () => {
    const r = computeY5Sensitivity(upswitchCtx)
    expect(r).not.toBeNull()
    expect(r!.mid).toBe(upswitchCtx.preMoney)
    // Symmetric within rounding
    const lowDelta = r!.mid - r!.low
    const highDelta = r!.high - r!.mid
    expect(Math.abs(lowDelta - highDelta)).toBeLessThan(1)
  })

  it('returns null when pre-money is zero', () => {
    const empty: NarrativeContext = { ...upswitchCtx, preMoney: 0 }
    expect(computeY5Sensitivity(empty)).toBeNull()
  })

  it('falls back to ±10% band when VC leg is unavailable', () => {
    // Pre-revenue founder with no Y5 model → VC drops out → sensitivity
    // can't be derived from the VC share.  We still return a band so
    // the UI renders something honest, but at a reduced spread.
    const noVc: NarrativeContext = {
      ...upswitchCtx,
      legs: { ...upswitchCtx.legs, vc: null },
    }
    const r = computeY5Sensitivity(noVc)
    expect(r).not.toBeNull()
    expect(r!.spreadPct).toBe(10)
    expect(r!.low).toBeLessThan(r!.mid)
    expect(r!.high).toBeGreaterThan(r!.mid)
  })

  it('clamps the low end to zero (never produces negative pre-money)', () => {
    // Defensive — pathological case where the VC share is so dominant
    // and pct so high the symmetric subtraction would go negative.  The
    // founder facing this in the UI would be confused by "−€2M pre".
    const tiny: NarrativeContext = { ...upswitchCtx, preMoney: 1000 }
    const r = computeY5Sensitivity(tiny, 200)
    expect(r!.low).toBeGreaterThanOrEqual(0)
  })
})
