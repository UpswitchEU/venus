import { describe, expect, it } from 'vitest'
import { adjustmentForYear } from './NormalizationViewModel'
import type { NormalizationItem } from './UnifiedNormalizationTypes'

function normalizationItem(overrides: Partial<NormalizationItem>): NormalizationItem {
  return {
    id: 'normalization-1',
    ledgerCode: '610000',
    ledgerName: 'Management fees',
    category: 'other',
    type: 'add',
    value: 0,
    adjustment: 0,
    source: 'manual',
    status: 'accepted',
    applyAllYears: false,
    year: 2024,
    ...overrides,
  }
}

describe('adjustmentForYear', () => {
  it('uses year-specific EBITDA for percentage add-backs', () => {
    const item = normalizationItem({
      type: 'add_percent',
      value: 10,
      adjustment: 1000,
    })

    expect(adjustmentForYear(item, 2024, 100_000, { 2024: 250_000 })).toBe(25_000)
  })

  it('falls back to the current EBITDA when a year baseline is missing', () => {
    const item = normalizationItem({
      type: 'subtract_percent',
      value: 4,
      adjustment: -1,
    })

    expect(adjustmentForYear(item, 2024, 200_000, { 2023: 999_999 })).toBe(-8_000)
  })

  it('recalculates absolute targets against the selected year baseline', () => {
    const item = normalizationItem({
      type: 'absolute',
      value: 350_000,
      adjustment: 0,
    })

    expect(adjustmentForYear(item, 2025, 100_000, { 2025: 200_000 })).toBe(150_000)
  })

  it('keeps fixed-amount normalizations independent of EBITDA baselines', () => {
    const item = normalizationItem({
      type: 'add',
      value: 10,
      adjustment: 12_345,
    })

    expect(adjustmentForYear(item, 2024, 100_000, { 2024: 999_999 })).toBe(12_345)
  })
})
