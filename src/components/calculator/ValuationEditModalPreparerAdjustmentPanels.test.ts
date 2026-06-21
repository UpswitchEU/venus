import { describe, expect, it } from 'vitest'
import type { SuggestedBand } from '../../store/manual/preparerCalibrationSuggestions'
import {
  clampProjectedMultiple,
  clampToSliderRange,
} from './ValuationEditModalPreparerAdjustmentPanels'

describe('clampToSliderRange', () => {
  it('keeps arbitrary numeric input inside the slider domain', () => {
    expect(clampToSliderRange(1, 2, 8)).toBe(2)
    expect(clampToSliderRange(4.25, 2, 8)).toBe(4.25)
    expect(clampToSliderRange(9, 2, 8)).toBe(8)
  })
})

describe('clampProjectedMultiple', () => {
  it('projects premium and discount bands from the benchmark multiple', () => {
    const premium: SuggestedBand = { direction: 'premium', lowPct: 10, highPct: 30, midPct: 25 }
    const discount: SuggestedBand = { direction: 'discount', lowPct: 10, highPct: 30, midPct: 25 }

    expect(
      clampProjectedMultiple({
        benchmarkNum: 4,
        band: premium,
        sliderMin: 1,
        sliderMax: 10,
      })
    ).toBe(5)
    expect(
      clampProjectedMultiple({
        benchmarkNum: 4,
        band: discount,
        sliderMin: 1,
        sliderMax: 10,
      })
    ).toBe(3)
  })

  it('keeps suggested multiples inside the slider domain', () => {
    const highPremium: SuggestedBand = {
      direction: 'premium',
      lowPct: 100,
      highPct: 300,
      midPct: 200,
    }
    const deepDiscount: SuggestedBand = {
      direction: 'discount',
      lowPct: 80,
      highPct: 100,
      midPct: 90,
    }

    expect(
      clampProjectedMultiple({
        benchmarkNum: 6,
        band: highPremium,
        sliderMin: 2,
        sliderMax: 8,
      })
    ).toBe(8)
    expect(
      clampProjectedMultiple({
        benchmarkNum: 6,
        band: deepDiscount,
        sliderMin: 2,
        sliderMax: 8,
      })
    ).toBe(2)
  })
})
