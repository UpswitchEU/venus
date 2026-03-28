import { describe, expect, it } from 'vitest'
import { deriveDcfSmartDefaults } from './dcfSmartDefaults'

describe('deriveDcfSmartDefaults', () => {
  it('derives sane defaults from historical revenue and EBITDA', () => {
    const defaults = deriveDcfSmartDefaults({
      businessCategory: 'saas_software',
      yearlyFinancials: [
        { year: '2022', revenue: 1_000_000, ebitda: 150_000 },
        { year: '2023', revenue: 1_150_000, ebitda: 195_000 },
        { year: '2024', revenue: 1_300_000, ebitda: 247_000 },
      ],
    })

    expect(defaults).toMatchObject({
      historicalYearsUsed: 3,
      ebitdaMarginPct: 19,
      capexPct: 3.8,
      waccPct: 11.5,
      terminalGrowthPct: 2.5,
    })
    expect(defaults?.revenueGrowthPct).toBeGreaterThan(10)
  })

  it('ignores forecast rows and falls back conservatively with limited history', () => {
    const defaults = deriveDcfSmartDefaults({
      businessCategory: 'retail',
      yearlyFinancials: [
        { year: '2024', revenue: 800_000, ebitda: 64_000 },
        { year: '2025', revenue: 900_000, ebitda: 90_000, isForecast: true },
      ],
    })

    expect(defaults).toEqual({
      revenueGrowthPct: 5,
      ebitdaMarginPct: 8,
      capexPct: 2,
      daPct: 2,
      taxRatePct: 25,
      exitMultiple: 6,
      waccPct: 11.5,
      terminalGrowthPct: 1.5,
      historicalYearsUsed: 1,
    })
  })

  it('returns null when no usable historical rows exist', () => {
    expect(
      deriveDcfSmartDefaults({
        yearlyFinancials: [{ year: '2025', revenue: 500_000, ebitda: 50_000, isForecast: true }],
      })
    ).toBeNull()
  })
})
