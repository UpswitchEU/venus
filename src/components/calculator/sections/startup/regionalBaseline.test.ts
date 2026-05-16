/**
 * Regional baseline + Berkus / SaaS / VC preview math — unit tests.
 *
 * These pure helpers underpin the live cap-table preview, the
 * forward-ARR pill, and the Berkus EUR-value display in the left
 * panel.  They are *advisory* (the report-side number always comes
 * from the Python engine) but if they drift from the engine the
 * founder will see one number on the panel and a different one on
 * the report — a credibility killer.
 *
 * The contract these tests lock in:
 *
 *   1. Regional baseline mirrors `regional_data.py` byte-for-byte.
 *   2. Berkus contribution math matches `berkus.calculate_berkus`.
 *   3. Forward ARR mirrors `saas_forward._project_forward_arr`.
 *   4. VC method preview mirrors `vc_method.calculate_vc_method`,
 *      including the oversubscribed-clamp-to-zero behaviour.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TARGET_ROI_X,
  getRegionalBaseline,
  previewBerkusContribution,
  previewVcMethod,
  projectForwardArrEur,
} from './regionalBaseline'

describe('getRegionalBaseline', () => {
  it('returns BE seed numbers that mirror regional_data.py', () => {
    const ref = getRegionalBaseline('BE', 'seed')
    expect(ref.average_pre_money).toBe(4_000_000)
    expect(ref.max_per_milestone).toBe(500_000)
    expect(ref.total_berkus_cap).toBe(2_500_000)
    expect(ref.comparable_exit_revenue_multiple).toBe(6)
    expect(ref.default_target_roi_x).toBe(20)
    expect(ref.default_dilution_pct).toBe(55)
  })

  it('series A bumps the per-milestone Berkus cap to €750k → €3.75M total', () => {
    // Mirrors the per-stage exception in regional_data.py — Series A
    // companies have removed enough risk that the per-milestone cap
    // shifts upward, which the Berkus baseline pill must surface so
    // founders don't see a "stuck on €2.5M" UI.
    const ref = getRegionalBaseline('BE', 'series_a')
    expect(ref.max_per_milestone).toBe(750_000)
    expect(ref.total_berkus_cap).toBe(3_750_000)
  })

  it('NL and LU alias BE numbers (matches regional_data.py explicit aliases)', () => {
    expect(getRegionalBaseline('NL', 'seed').average_pre_money).toBe(4_000_000)
    expect(getRegionalBaseline('LU', 'seed').average_pre_money).toBe(4_000_000)
    // region_code is faithfully reflected so the UI doesn't always show "BE".
    expect(getRegionalBaseline('NL', 'seed').region_code).toBe('NL')
  })

  it('falls back to BE for unknown country codes (engine never crashes)', () => {
    const fallback = getRegionalBaseline('ZZ', 'seed')
    expect(fallback.average_pre_money).toBe(4_000_000)
    expect(fallback.region_code).toBe('BE')
  })

  it('normalises country code casing (mixed-case inputs are accepted)', () => {
    expect(getRegionalBaseline('be', 'seed').average_pre_money).toBe(4_000_000)
    expect(getRegionalBaseline('Nl', 'seed').average_pre_money).toBe(4_000_000)
  })
})

describe('previewBerkusContribution', () => {
  it('zero score → zero contribution', () => {
    expect(previewBerkusContribution(0, 500_000)).toBe(0)
  })

  it('full score → full per-milestone cap', () => {
    expect(previewBerkusContribution(100, 500_000)).toBe(500_000)
  })

  it('linearly scales between 0 and 100', () => {
    expect(previewBerkusContribution(50, 500_000)).toBe(250_000)
    expect(previewBerkusContribution(70, 750_000)).toBe(525_000)
  })

  it('clamps negative or >100 scores so the EUR pill never goes wild', () => {
    expect(previewBerkusContribution(-10, 500_000)).toBe(0)
    expect(previewBerkusContribution(120, 500_000)).toBe(500_000)
  })

  it('treats non-finite inputs (NaN / Infinity) as zero — defensive against bad upstream state', () => {
    // The slider primitive only ever emits 0..100 integers, but a
    // corrupt persisted store or a stale URL deep-link could feed
    // NaN/Infinity. We zero-out instead of attempting to clamp so a
    // corrupt input never produces a fantasy EUR contribution.
    expect(previewBerkusContribution(NaN, 500_000)).toBe(0)
    expect(previewBerkusContribution(Infinity, 500_000)).toBe(0)
  })
})

describe('projectForwardArrEur', () => {
  it('returns null when neither MRR nor ARR is supplied', () => {
    expect(projectForwardArrEur({ mrr: null, arr: null, momGrowthPct: 10 })).toBeNull()
  })

  it('infers MRR from ARR when only ARR is supplied', () => {
    // ARR / 12 = monthly anchor; with 0 growth the forward ARR
    // collapses back to the input ARR.
    const arr = projectForwardArrEur({ mrr: null, arr: 120_000, momGrowthPct: 0 })
    expect(arr).toBe(120_000)
  })

  it('compounds monthly growth over 12 months', () => {
    // €10k MRR at 10% MoM → 10000 * 1.1^12 * 12 ≈ €376,538.
    const arr = projectForwardArrEur({ mrr: 10_000, arr: null, momGrowthPct: 10 })
    expect(arr).not.toBeNull()
    expect(arr ?? 0).toBeGreaterThan(370_000)
    expect(arr ?? 0).toBeLessThan(380_000)
  })

  it('caps growth at 20% MoM to avoid fantasy projections', () => {
    // The cap mirrors `_MAX_MOM_GROWTH_PCT` in saas_forward.py.
    // Bumping growth from 20% to 50% must not change the output.
    const at20 = projectForwardArrEur({ mrr: 10_000, arr: null, momGrowthPct: 20 })
    const at50 = projectForwardArrEur({ mrr: 10_000, arr: null, momGrowthPct: 50 })
    expect(at20).toBe(at50)
  })
})

describe('previewVcMethod', () => {
  const baseInputs = {
    year5Revenue: 5_000_000,
    exitMultiple: 6,
    targetRoi: 20,
    investmentSought: 500_000,
    fallbackRoi: DEFAULT_TARGET_ROI_X,
  }

  it('computes the academic VC formula: post = Y5 × multiple ÷ ROI', () => {
    // 5M × 6 ÷ 20 = 1.5M post-money.
    const out = previewVcMethod(baseInputs)
    expect(out).not.toBeNull()
    expect(out?.post).toBeCloseTo(1_500_000, 0)
    expect(out?.pre).toBeCloseTo(1_000_000, 0)
    expect(out?.dilution).toBeCloseTo((500_000 / 1_500_000) * 100, 1)
  })

  it('uses the fallback ROI when no target is provided', () => {
    // With fallbackRoi=15 we should get post = 5M*6/15 = 2M.
    const out = previewVcMethod({ ...baseInputs, targetRoi: null })
    expect(out).not.toBeNull()
    expect(out?.post).toBeCloseTo(2_000_000, 0)
  })

  it('clamps pre-money to zero when the ask exceeds the implied post-money', () => {
    // 5M × 6 ÷ 20 = 1.5M post; asking 2M means pre clamps to 0 and
    // the VC leg drops out — the panel should fire the "round too
    // large" warning, NOT show a negative pre-money.
    const out = previewVcMethod({ ...baseInputs, investmentSought: 2_000_000 })
    expect(out).not.toBeNull()
    expect(out?.pre).toBe(0)
  })

  it("returns null when math doesn't justify a number (Y5/multiple/ROI all zero)", () => {
    expect(
      previewVcMethod({
        year5Revenue: 0,
        exitMultiple: 0,
        targetRoi: 0,
        investmentSought: 0,
        fallbackRoi: DEFAULT_TARGET_ROI_X,
      })
    ).toBeNull()
  })

  it('clamps dilution into [0, 100] for display defensiveness', () => {
    // Even when investment > post (oversubscribed), dilution % must
    // not show as 200% — that reads like a UI bug. We surface the
    // signal via the dedicated oversubscribed warning instead.
    const out = previewVcMethod({ ...baseInputs, investmentSought: 5_000_000 })
    expect(out).not.toBeNull()
    expect(out?.dilution).toBeLessThanOrEqual(100)
    expect(out?.dilution).toBeGreaterThanOrEqual(0)
  })
})
