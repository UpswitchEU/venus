import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../UnifiedNormalizationModal'
import { getSeedYearlyFinancials } from './manualFinancialSeeds'
import { buildManualInputNormalizedData } from './manualInputNormalizedData'

function item(overrides: Partial<NormalizationItem>): NormalizationItem {
  return {
    id: 'norm-1',
    ledgerCode: '620000',
    ledgerName: 'Management fee',
    category: 'salary',
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

describe('buildManualInputNormalizedData', () => {
  it('applies accepted normalizations per fiscal year and computes recency-weighted EBITDA', () => {
    const result = buildManualInputNormalizedData({
      excludeRealEstate: false,
      estimatedMarketRent: undefined,
      yearlyFinancials: [
        { year: '2023', revenue: 1_000_000, ebitda: 100_000 },
        { year: '2024', revenue: 1_200_000, ebitda: 200_000 },
      ],
      normalizationItems: [
        item({ id: 'accepted-2024', year: 2024, adjustment: 30_000 }),
        item({ id: 'pending-2024', year: 2024, adjustment: 500_000, status: 'pending' }),
        item({ id: 'all-years-percent', type: 'add_percent', value: 10, applyAllYears: true }),
      ],
    })

    const year2023 = result.years.find((year) => year.year === '2023')
    const year2024 = result.years.find((year) => year.year === '2024')

    expect(year2023?.normalizedEbitda).toBe(110_000)
    expect(year2024?.normalizedEbitda).toBe(250_000)
    expect(result.averageNormalizedEbitda).toBeCloseTo((110_000 + 250_000 * 2) / 3)
    expect(result.totalYearsWithData).toBe(2)
  })

  it('deducts annual fictive rent from each normalized EBITDA year when real estate is carved out', () => {
    const result = buildManualInputNormalizedData({
      excludeRealEstate: true,
      estimatedMarketRent: 24_000,
      yearlyFinancials: [{ year: '2024', revenue: 1_000_000, ebitda: 200_000 }],
      normalizationItems: [],
    })

    expect(result.annualFictiveRentDeduction).toBe(24_000)
    expect(result.years[0].normalizedEbitda).toBe(176_000)
    expect(result.averageNormalizedEbitda).toBe(176_000)
  })
})

it('restores reported EBITDA before applying an accepted imported adjustment once', () => {
  const current = {
    year: 2025,
    revenue: 1_450_000,
    ebitda: 491_500,
    reported_ebitda: 335_000,
    ebitda_normalized: true,
  }
  const yearlyFinancials = getSeedYearlyFinancials(
    {
      current_year_data: current,
      yearlyFinancials: [
        { year: '2025', revenue: 1_450_000, ebitda: 335_000 },
        { year: '2021', revenue: 750_000, ebitda: 125_000 },
      ],
    },
    new Date('2026-09-13')
  )
  const result = buildManualInputNormalizedData({
    yearlyFinancials,
    excludeRealEstate: false,
    estimatedMarketRent: undefined,
    normalizationItems: [
      item({ year: 2025, adjustment: 156_500 }),
      item({ year: 2021, adjustment: 97_500, status: 'pending' }),
    ],
  })
  expect(yearlyFinancials[0].ebitda).toBe(335_000)
  expect(result.years[0].normalizedEbitda).toBe(491_500)
  expect(result.averageNormalizedEbitda).toBeCloseTo(369_333.333333)
  expect(current.ebitda).toBe(491_500)
})

it('shows the same decimal bridge as the submitted annual normalization', () => {
  const result = buildManualInputNormalizedData({
    yearlyFinancials: [{ year: '2025', revenue: 1, ebitda: -0.3 }],
    excludeRealEstate: false,
    estimatedMarketRent: undefined,
    normalizationItems: [
      item({ id: 'a', year: 2025, adjustment: 0.1, value: 0.1 }),
      item({ id: 'b', year: 2025, adjustment: 0.2, value: 0.2 }),
    ],
  })
  expect(result.years[0].totalAdjustment).toBe(0.3)
  expect(result.years[0].normalizedEbitda).toBe(0)
  expect(result.averageNormalizedEbitda).toBe(0)
})

it('does not show an unreviewed imported addback that calculation will leave pending', () => {
  const result = buildManualInputNormalizedData({
    yearlyFinancials: [{ year: '2025', revenue: 1000, ebitda: 100 }],
    excludeRealEstate: false,
    estimatedMarketRent: undefined,
    normalizationItems: [
      item({ id: 'imported_sde_cost', year: 2025, source: 'auto', adjustment: 80, value: 80 }),
    ],
  })
  expect(result.years[0].normalizationCount).toBe(0)
  expect(result.averageNormalizedEbitda).toBe(100)
})
