import { describe, expect, it } from 'vitest'
import {
  computeEstimatedNav,
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

describe('computeEstimatedNav (round-1 fix B6)', () => {
  // Without side revaluations: book equity + sum + tax latency on positive
  // adjustments (excl. goodwill) − off-balance.
  it('returns the schedule-only baseline when no side revaluations', () => {
    expect(
      computeEstimatedNav(
        1_000_000, // total assets
        400_000, // total liabilities
        100_000, // gross adjustment sum (NET — already accounts for negatives)
        100_000, // gross positive adjustments (tax base)
        25, // 25% tax latency
        50_000 // off-balance (subtracted)
      )
    ).toBe(
      // 600k book + 100k − 25k tax − 50k off-balance = 625k
      625_000
    )
  })

  it('adds the appraisal swap meerwaarde to the running net + tax base', () => {
    expect(
      computeEstimatedNav(1_000_000, 400_000, 0, 0, 25, 0, { realEstateMeerwaarde: 200_000 })
    ).toBe(
      // 600k + 200k − 50k tax (25% on 200k uplift) = 750k
      750_000
    )
  })

  it('adds equipment meerwaarde alongside the appraisal swap', () => {
    expect(
      computeEstimatedNav(1_000_000, 400_000, 0, 0, 25, 0, {
        realEstateMeerwaarde: 100_000,
        equipmentMeerwaarde: 50_000,
      })
    ).toBe(
      // 600k + 150k uplift − 37.5k tax (25% on 150k) = 712.5k
      712_500
    )
  })

  it('side revaluations contribute to net but only positive amounts grow the tax base', () => {
    // An impairment (negative meerwaarde) should reduce the running NAV
    // but should NOT increase the tax-latency deduction.
    expect(
      computeEstimatedNav(1_000_000, 400_000, 0, 0, 25, 0, { realEstateMeerwaarde: -100_000 })
    ).toBe(
      // 600k − 100k impairment − 0 tax (impairment is not a gain) = 500k
      500_000
    )
  })

  it('returns null when balance-sheet inputs are missing', () => {
    expect(
      computeEstimatedNav(undefined, 400_000, 0, 0, 25, 0, {
        realEstateMeerwaarde: 100_000,
      })
    ).toBeNull()
  })
})
