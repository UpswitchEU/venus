import { describe, expect, it } from 'vitest'
import {
  buildAdvisorDiscountWeightUpdate,
  buildEqualHistoricalWeights,
  buildHistoricalWeightingModeUpdates,
  buildHistoricalWeightUpdate,
  buildMultipleTypeWeightUpdate,
  buildRecencyHistoricalWeights,
  buildResetDiscountControlUpdates,
  clampDiscountFloorFactor,
  clampDiscountWeight,
  deriveAdvancedAdvisorControlModel,
  deriveHistoricalYearWeightingModel,
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

  it('derives the shared historical-year weighting model (caps at 5 years, recency-eligible at 3+)', () => {
    const empty = deriveHistoricalYearWeightingModel({ historicalYears: [2024] })
    expect(empty.mode).toBe('standard')
    expect(empty.canWeight).toBe(false)

    const model = deriveHistoricalYearWeightingModel({
      historicalYears: [2019, 2020, 2021, 2022, 2023, 2024],
      historicalEbitdaWeightingMode: 'weighted',
      historicalEbitdaWeights: { 2024: 40, 2023: 30, 2022: 20, 2021: 10 },
    })
    expect(model.mode).toBe('weighted')
    expect(model.canWeight).toBe(true)
    // Oldest year dropped — only the five most recent remain.
    expect(model.years).toEqual([2020, 2021, 2022, 2023, 2024])
    expect(model.yearKeys).toEqual(['2020', '2021', '2022', '2023', '2024'])
  })

  it('builds the recency ramp (most recent year heaviest, summing to 100)', () => {
    // Three years resolve to the canonical 50/33/17 split.
    expect(buildRecencyHistoricalWeights(['2023', '2024', '2025'])).toEqual({
      2023: 17,
      2024: 33,
      2025: 50,
    })
    // Four/five years extend the same ramp and still sum to 100.
    expect(buildRecencyHistoricalWeights(['2022', '2023', '2024', '2025'])).toEqual({
      2022: 10,
      2023: 20,
      2024: 30,
      2025: 40,
    })
    const fiveYear = buildRecencyHistoricalWeights(['2021', '2022', '2023', '2024', '2025'])
    expect(Object.values(fiveYear).reduce((sum, weight) => sum + weight, 0)).toBe(100)
    expect(fiveYear[2025]).toBeGreaterThan(fiveYear[2021])
    // Order-independent: most recent year always carries the most weight.
    expect(buildRecencyHistoricalWeights(['2025', '2023', '2024'])[2025]).toBe(50)
  })

  it('builds exact historical weighting update payloads for the section dispatcher', () => {
    expect(buildEqualHistoricalWeights(['2023', '2024', '2025'])).toEqual({
      2023: 34,
      2024: 33,
      2025: 33,
    })
    expect(
      buildHistoricalWeightingModeUpdates({
        nextMode: 'weighted',
        yearKeys: ['2023', '2024', '2025'],
      })
    ).toEqual([
      { field: 'historical_ebitda_weighting_mode', value: 'weighted' },
      // Switching to custom seeds the recency default (50/33/17), not a flat split.
      { field: 'historical_ebitda_weights', value: { 2023: 17, 2024: 33, 2025: 50 } },
    ])
    expect(
      buildHistoricalWeightingModeUpdates({
        nextMode: 'standard',
        yearKeys: ['2023', '2024', '2025'],
      })
    ).toEqual([
      { field: 'historical_ebitda_weighting_mode', value: 'standard' },
      { field: 'historical_ebitda_weights', value: undefined },
    ])
    expect(
      Object.values(
        buildHistoricalWeightUpdate({
          rawWeights: { '2023': 34, '2024': 33, '2025': 33 },
          year: 2024,
          nextValue: 43,
        })
      ).reduce((sum, weight) => sum + weight, 0)
    ).toBe(100)
  })

  it('builds exact advisor multiple and discount update payloads', () => {
    expect(
      buildMultipleTypeWeightUpdate({
        multipleBlendWeights: { ev_ebitda: 60, ev_revenue: 30, pe: 10 },
        key: 'ev_revenue',
        nextValue: 31,
      })
    ).toEqual({ ev_ebitda: 59, ev_revenue: 31, pe: 10 })

    expect(
      buildAdvisorDiscountWeightUpdate({
        discountWeights: {
          size_discount: 0.5,
          liquidity_discount: 1.25,
          country_adjustment: 1,
          growth_premium: 1,
          owner_concentration: 1,
        },
        key: 'size_discount',
        nextValue: 3,
      })
    ).toEqual({
      size_discount: 2,
      liquidity_discount: 1.25,
      country_adjustment: 1,
      growth_premium: 1,
      owner_concentration: 1,
    })

    expect(buildResetDiscountControlUpdates()).toEqual([
      { field: 'advisor_discount_weights', value: undefined },
      { field: 'discount_floor_factor', value: undefined },
    ])
  })
})
