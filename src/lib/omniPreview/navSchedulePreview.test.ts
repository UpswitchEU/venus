import { describe, expect, it } from 'vitest'
import {
  computeNavAdjustmentsSum,
  countFilledNavProgressFields,
  hasAnyNavAdjustment,
  NAV_PROGRESS_TOTAL_FIELDS,
} from './navSchedulePreview'

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

  it('counts deduction inputs in NAV progress', () => {
    expect(
      countFilledNavProgressFields({
        navTaxLatencyPct: 25,
        navOffBalanceItems: 0,
      })
    ).toBe(2)
  })

  it('exposes the full progress denominator including deductions', () => {
    expect(NAV_PROGRESS_TOTAL_FIELDS).toBe(8)
  })
})
