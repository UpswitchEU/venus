import { describe, expect, it } from 'vitest'

import {
  detectDossierSignal,
  projectSuggestedMultiple,
  SCENARIO_PRESETS,
  SUGGESTED_DELTA_BAND,
} from '../preparerCalibrationSuggestions'

describe('SUGGESTED_DELTA_BAND', () => {
  it('keeps midpoints within their own low/high bands', () => {
    for (const [reason, band] of Object.entries(SUGGESTED_DELTA_BAND)) {
      if (band == null) continue
      expect(band.midPct, `${reason}.midPct`).toBeGreaterThanOrEqual(band.lowPct)
      expect(band.midPct, `${reason}.midPct`).toBeLessThanOrEqual(band.highPct)
    }
  })

  it('encodes "other" as null (no academic anchor — preparer must justify)', () => {
    expect(SUGGESTED_DELTA_BAND.other).toBeNull()
  })

  it('classifies premium-flavoured reasons as direction=premium', () => {
    expect(SUGGESTED_DELTA_BAND.strategic_buyer_premium?.direction).toBe('premium')
    expect(SUGGESTED_DELTA_BAND.exceptional_management_premium?.direction).toBe('premium')
    expect(SUGGESTED_DELTA_BAND.recurring_revenue_premium?.direction).toBe('premium')
  })

  it('classifies discount-flavoured reasons as direction=discount', () => {
    expect(SUGGESTED_DELTA_BAND.key_person_discount?.direction).toBe('discount')
    expect(SUGGESTED_DELTA_BAND.customer_concentration?.direction).toBe('discount')
    expect(SUGGESTED_DELTA_BAND.distressed_sale?.direction).toBe('discount')
    expect(SUGGESTED_DELTA_BAND.real_estate_included?.direction).toBe('discount')
  })
})

describe('detectDossierSignal', () => {
  it('returns null when no dossier signal applies', () => {
    expect(detectDossierSignal({})).toBeNull()
    expect(
      detectDossierSignal({
        recurringRevenuePercentage: 0.2,
        ownerConcentrationRisk: 'LOW',
        customerConcentrationPct: 0.1,
      })
    ).toBeNull()
  })

  it('prioritises critical owner-dependency over recurring-revenue', () => {
    const signal = detectDossierSignal({
      ownerConcentrationRisk: 'CRITICAL',
      recurringRevenuePercentage: 0.95, // would otherwise win
    })
    expect(signal).not.toBeNull()
    expect(signal?.reasonKey).toBe('key_person_discount')
    expect(signal?.i18nKey).toBe('signalOwnerCritical')
  })

  it('returns recurring-revenue premium when only that signal is present', () => {
    const signal = detectDossierSignal({
      recurringRevenuePercentage: 0.72,
    })
    expect(signal).not.toBeNull()
    expect(signal?.reasonKey).toBe('recurring_revenue_premium')
    expect(signal?.band.direction).toBe('premium')
    expect(signal?.i18nValues?.percent).toBe(72)
  })

  it('returns customer-concentration discount at ≥25% top-client share', () => {
    const signal = detectDossierSignal({
      customerConcentrationPct: 0.32,
    })
    expect(signal).not.toBeNull()
    expect(signal?.reasonKey).toBe('customer_concentration')
    expect(signal?.i18nValues?.percent).toBe(32)
  })

  it('skips the suggestion when the engine has already discounted for it', () => {
    // Owner risk HIGH but the engine already applied an "Owner Concentration"
    // step in the waterfall — don't double-count.
    const signal = detectDossierSignal({
      ownerConcentrationRisk: 'HIGH',
      appliedWaterfallStepNames: ['Owner Concentration', 'Size Discount'],
    })
    expect(signal).toBeNull()
  })

  it('skips recurring-revenue suggestion when the engine already booked it', () => {
    const signal = detectDossierSignal({
      recurringRevenuePercentage: 0.85,
      appliedWaterfallStepNames: ['Recurring Revenue Bonus'],
    })
    expect(signal).toBeNull()
  })

  it('treats CRITICAL and HIGH owner risk as the same reason key', () => {
    const high = detectDossierSignal({ ownerConcentrationRisk: 'HIGH' })
    const critical = detectDossierSignal({ ownerConcentrationRisk: 'CRITICAL' })
    expect(high?.reasonKey).toBe('key_person_discount')
    expect(critical?.reasonKey).toBe('key_person_discount')
    // But the i18n key differs so the UI can show "high" vs "critical".
    expect(high?.i18nKey).not.toBe(critical?.i18nKey)
  })
})

describe('SCENARIO_PRESETS', () => {
  it('exposes exactly four curated presets (the M&A "shapes")', () => {
    expect(SCENARIO_PRESETS.map((p) => p.id)).toEqual([
      'distressed',
      'strategic_buyer',
      'recurring_premium',
      'customer_concentration',
    ])
  })

  it('every preset maps to an academic-anchored reason (no `other`)', () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(SUGGESTED_DELTA_BAND[preset.reasonKey]).not.toBeNull()
      // Each preset's band must equal the canonical band map entry — proves
      // we're not silently drifting from the audit numbers.
      expect(preset.band).toEqual(SUGGESTED_DELTA_BAND[preset.reasonKey])
    }
  })

  it('each preset carries label + hint i18n keys (no English literals)', () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.labelI18nKey).toMatch(/^preset[A-Z]/)
      expect(preset.hintI18nKey).toMatch(/^preset[A-Z].*Hint$/)
    }
  })

  it('the chip applied with `projectSuggestedMultiple` produces the canonical band-midpoint', () => {
    // bench=5.5 → distressed midPct=35 (discount) → 5.5 × 0.65 = 3.575 → 3.58
    const distressed = SCENARIO_PRESETS.find((p) => p.id === 'distressed')!
    expect(projectSuggestedMultiple(5.5, distressed.band)).toBe(3.58)
  })
})

describe('projectSuggestedMultiple', () => {
  it('applies a discount factor (1 − midPct/100) to the benchmark', () => {
    // key-person discount midPct=25 → 5.50× × 0.75 = 4.13×
    const projected = projectSuggestedMultiple(5.5, SUGGESTED_DELTA_BAND.key_person_discount!)
    expect(projected).toBe(4.13)
  })

  it('applies a premium factor (1 + midPct/100) to the benchmark', () => {
    // strategic-buyer premium midPct=25 → 5.50× × 1.25 = 6.88×
    const projected = projectSuggestedMultiple(5.5, SUGGESTED_DELTA_BAND.strategic_buyer_premium!)
    expect(projected).toBe(6.88)
  })

  it('rounds to 2 decimal places (not banker rounding)', () => {
    const result = projectSuggestedMultiple(5.555, {
      direction: 'discount',
      lowPct: 10,
      highPct: 20,
      midPct: 15,
    })
    // 5.555 × 0.85 = 4.72175 → 4.72
    expect(result).toBe(4.72)
  })
})
