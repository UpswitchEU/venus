// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '@/types/valuation'
import { resolveLatestRevenueForQuality } from './RevenueQualitySectionStack'

describe('resolveLatestRevenueForQuality', () => {
  it('prefers latest complete yearly financial', () => {
    const rev = resolveLatestRevenueForQuality(
      { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      {} as ManualValuationFormData
    )
    expect(rev).toBe(1_000_000)
  })

  it('falls back to latest historical year when complete year missing', () => {
    const rev = resolveLatestRevenueForQuality(undefined, {
      yearlyFinancials: [
        { year: 2024, revenue: 900_000, ebitda: 90_000, isForecast: false },
        { year: 2025, revenue: 1_000_000, ebitda: 100_000, isForecast: false },
        { year: 2026, revenue: 1_100_000, ebitda: 110_000, isForecast: true },
      ],
    } as ManualValuationFormData)
    expect(rev).toBe(1_000_000)
  })

  it('uses current_year_data when no yearly rows', () => {
    const rev = resolveLatestRevenueForQuality(undefined, {
      current_year_data: { year: 2025, revenue: 750_000, ebitda: 75_000 },
    } as ManualValuationFormData)
    expect(rev).toBe(750_000)
  })

  it('ignores snake_case forecast rows from legacy session payloads', () => {
    const rev = resolveLatestRevenueForQuality(undefined, {
      yearlyFinancials: [
        { year: 2024, revenue: 900_000, ebitda: 90_000, is_forecast: false },
        { year: 2025, revenue: 1_000_000, ebitda: 100_000, is_forecast: false },
        { year: 2026, revenue: 1_100_000, ebitda: 110_000, is_forecast: true },
      ],
    } as ManualValuationFormData)
    expect(rev).toBe(1_000_000)
  })
})
