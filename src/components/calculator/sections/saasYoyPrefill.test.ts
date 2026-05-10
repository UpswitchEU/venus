import { describe, expect, it } from 'vitest'
import { computeYoyRevenueGrowthPct } from './saasYoyPrefill'

describe('computeYoyRevenueGrowthPct', () => {
  it('returns null with no rows', () => {
    expect(computeYoyRevenueGrowthPct(null)).toBeNull()
    expect(computeYoyRevenueGrowthPct([])).toBeNull()
  })

  it('returns null with a single historical year (cannot compute YoY)', () => {
    expect(computeYoyRevenueGrowthPct([{ year: '2024', revenue: 100_000 }])).toBeNull()
  })

  it('computes YoY across the two most recent historical years', () => {
    const rows = [
      { year: '2022', revenue: 500_000 },
      { year: '2023', revenue: 750_000 },
      { year: '2024', revenue: 1_125_000 },
    ]
    // (1_125_000 - 750_000) / 750_000 = 0.5 → 50.0
    expect(computeYoyRevenueGrowthPct(rows)).toBe(50)
  })

  it('skips forecast rows so projections do not poison the prefill', () => {
    const rows = [
      { year: '2023', revenue: 1_000_000, isForecast: false },
      { year: '2024', revenue: 1_500_000, isForecast: false },
      { year: '2025', revenue: 5_000_000, isForecast: true },
    ]
    // YoY uses 2024 vs 2023 → 50.0
    expect(computeYoyRevenueGrowthPct(rows)).toBe(50)
  })

  it('returns null when prior-year revenue is zero or negative', () => {
    expect(
      computeYoyRevenueGrowthPct([
        { year: '2023', revenue: 0 },
        { year: '2024', revenue: 200_000 },
      ]),
    ).toBeNull()
    expect(
      computeYoyRevenueGrowthPct([
        { year: '2023', revenue: -10_000 },
        { year: '2024', revenue: 200_000 },
      ]),
    ).toBeNull()
  })

  it('clamps absurd growth values to the defensible band', () => {
    const huge = [
      { year: '2023', revenue: 100 },
      { year: '2024', revenue: 1_000_000 },
    ]
    // Raw = 999,900% — clamped to ceiling 500
    expect(computeYoyRevenueGrowthPct(huge)).toBe(500)

    const collapse = [
      { year: '2023', revenue: 1_000_000 },
      { year: '2024', revenue: 100_000 },
    ]
    // Raw = -90% — clamped to floor -50
    expect(computeYoyRevenueGrowthPct(collapse)).toBe(-50)
  })

  it('rounds to one decimal so the prefill never looks fake-precise', () => {
    const rows = [
      { year: '2023', revenue: 333_333 },
      { year: '2024', revenue: 444_444 },
    ]
    // Raw = 33.333…% → 33.3
    expect(computeYoyRevenueGrowthPct(rows)).toBe(33.3)
  })

  it('handles numeric year keys equivalently to string years', () => {
    expect(
      computeYoyRevenueGrowthPct([
        { year: 2023, revenue: 1_000_000 },
        { year: 2024, revenue: 1_200_000 },
      ]),
    ).toBe(20)
  })
})
