import { describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../UnifiedNormalizationModal'
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
