import { describe, expect, it } from 'vitest'
import { computeNavAdjustmentsSum, hasAnyNavAdjustment } from './navSchedulePreview'

describe('navSchedulePreview', () => {
  it('sums finite adjustments', () => {
    expect(
      computeNavAdjustmentsSum({
        navRealEstateAdjustment: 10_000,
        navInventoryAdjustment: -5_000,
        navHiddenReserves: undefined,
        navGoodwillWriteoff: 0,
      })
    ).toBe(5000)
  })

  it('hasAnyNavAdjustment detects an entered zero', () => {
    expect(hasAnyNavAdjustment({ navGoodwillWriteoff: 0 })).toBe(true)
  })
})
