import { describe, expect, it } from 'vitest'
import {
  clampDiscountFloorFactor,
  clampDiscountWeight,
  deriveAdvancedAdvisorControlModel,
  normalizeMultipleTypeWeights,
  sortedDistinctYears,
} from './advancedAdvisorControlsModel'

describe('advancedAdvisorControlsModel', () => {
  it('normalizes mixed decimal and percentage multiple-type weights to 100%', () => {
    const weights = normalizeMultipleTypeWeights({
      ev_ebitda: 0.3,
      ev_revenue: 50,
      pe: 0.2,
    })

    expect(weights).toEqual({ ev_ebitda: 30, ev_revenue: 50, pe: 20 })
    expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBe(100)
  })

  it('derives live preview value movement from a calibration premium', () => {
    const model = deriveAdvancedAdvisorControlModel({
      sectorAverageMultiple: 5.5,
      multipleCalibrationAdjustment: 1.25,
      multipleCalibrationNote: 'Strong recurring revenue',
      previewEbitda: 100_000,
      historicalYears: [2023, 2024, 2025],
    })

    expect(model.calibratedMultiple).toBe(6.75)
    expect(model.livePreview).toMatchObject({
      beforeValue: 550_000,
      afterValue: 675_000,
      deltaValue: 125_000,
    })
    expect(model.activePreviewChangeKeys).toContain('livePreviewMultiplePremium')
    expect(model.complete).toBe(true)
  })

  it('lets an explicit effective multiple override win over a segment blend', () => {
    const model = deriveAdvancedAdvisorControlModel({
      sectorAverageMultiple: 5.5,
      effectiveMultipleOverride: 7,
      effectiveMultipleOverrideNote: 'Final defended multiple',
      businessTypeSegments: [
        { business_type_id: 'software', applied_multiple: 8, weight: 70 },
        { business_type_id: 'services', applied_multiple: 4, weight: 30 },
      ],
      previewEbitda: 100_000,
      historicalYears: [2023, 2024, 2025],
    })

    expect(model.segmentWeightedMultiple).toBe(6.8)
    expect(model.previewEffectiveMultiple).toBe(7)
    expect(model.livePreview?.afterValue).toBe(700_000)
    expect(model.activePreviewChangeKeys).toEqual([
      'livePreviewEffectiveOverride',
      'livePreviewSegmentWeights',
    ])
  })

  it('clamps advisor risk controls and exposes incomplete audit notes', () => {
    expect(clampDiscountWeight(-5)).toBe(0)
    expect(clampDiscountWeight(3.456)).toBe(2)
    expect(clampDiscountFloorFactor(-0.5)).toBe(0)
    expect(clampDiscountFloorFactor(1.5)).toBe(1)

    const model = deriveAdvancedAdvisorControlModel({
      sectorAverageMultiple: 5.5,
      multipleCalibrationAdjustment: -0.5,
      effectiveMultipleOverride: 6,
      advisorDiscountWeights: { size_discount: 3, liquidity_discount: 0.333 },
      discountFloorFactor: 1.4,
      historicalYears: [2025, 2023, 2024],
    })

    expect(model.noteComplete).toBe(false)
    expect(model.effectiveOverrideNoteComplete).toBe(false)
    expect(model.complete).toBe(false)
    expect(model.discountWeights).toMatchObject({
      size_discount: 2,
      liquidity_discount: 0.33,
    })
    expect(model.floorFactor).toBe(1)
  })

  it('sorts distinct finite years before taking the latest five', () => {
    const model = deriveAdvancedAdvisorControlModel({
      historicalYears: [2020, 2024, Number.NaN, 2022, 2023, 2021, 2024, 2019],
    })

    expect(sortedDistinctYears([2020, 2024, Number.NaN, 2022, 2023, 2021, 2024, 2019])).toEqual([
      2019, 2020, 2021, 2022, 2023, 2024,
    ])
    expect(model.years).toEqual([2020, 2021, 2022, 2023, 2024])
    expect(model.rawWeights).toEqual({ '2020': 20, '2021': 20, '2022': 20, '2023': 20, '2024': 20 })
  })
})
