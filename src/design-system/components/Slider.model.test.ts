import { describe, expect, it } from 'vitest'
import {
  clampSliderValue,
  getSliderPercentage,
  updateRangeSliderValue,
  valueFromSliderClientX,
} from './Slider.model'

describe('Slider model', () => {
  it('clamps and projects values without leaking invalid percentages', () => {
    expect(clampSliderValue(150, 0, 100)).toBe(100)
    expect(getSliderPercentage(50, 0, 100)).toBe(50)
    expect(getSliderPercentage(50, 10, 10)).toBe(0)
    expect(getSliderPercentage(Number.NaN, 0, 100)).toBe(0)
  })

  it('maps client coordinates to stepped slider values', () => {
    expect(valueFromSliderClientX(76, { left: 0, width: 100 }, { min: 0, max: 100, step: 5 })).toBe(
      75
    )
    expect(
      valueFromSliderClientX(-50, { left: 0, width: 100 }, { min: 10, max: 20, step: 2 })
    ).toBe(10)
    expect(
      valueFromSliderClientX(200, { left: 0, width: 100 }, { min: 10, max: 20, step: 2 })
    ).toBe(20)
  })

  it('falls back safely for invalid track geometry or step values', () => {
    expect(valueFromSliderClientX(50, { left: 0, width: 0 }, { min: 5, max: 10, step: 1 })).toBe(5)
    expect(valueFromSliderClientX(50, { left: 0, width: 100 }, { min: 0, max: 10, step: 0 })).toBe(
      5
    )
  })

  it('enforces range thumb minDistance without crossing thumbs', () => {
    expect(
      updateRangeSliderValue({
        currentValue: [20, 80],
        nextThumbValue: 95,
        thumbIndex: 0,
        min: 0,
        max: 100,
        minDistance: 10,
      })
    ).toEqual([70, 80])

    expect(
      updateRangeSliderValue({
        currentValue: [20, 80],
        nextThumbValue: 10,
        thumbIndex: 1,
        min: 0,
        max: 100,
        minDistance: 10,
      })
    ).toEqual([20, 30])
  })
})
