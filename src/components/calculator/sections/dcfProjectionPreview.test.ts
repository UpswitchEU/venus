import { describe, expect, it } from 'vitest'
import { deriveDcfProjectionPreview } from './dcfProjectionPreview'

describe('deriveDcfProjectionPreview', () => {
  it('projects three years from the latest actual year', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [
        { year: '2023', revenue: 1_000_000, ebitda: 150_000 },
        { year: '2024', revenue: 1_200_000, ebitda: 216_000 },
      ],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
    })

    expect(rows).toEqual([
      { year: 2025, revenue: 1_320_000, ebitda: 264_000 },
      { year: 2026, revenue: 1_452_000, ebitda: 290_400 },
      { year: 2027, revenue: 1_597_200, ebitda: 319_440 },
    ])
  })

  it('falls back to smart defaults when explicit inputs are missing', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2024', revenue: 900_000, ebitda: 90_000 }],
      smartDefaults: {
        revenueGrowthPct: 5,
        ebitdaMarginPct: 12,
        capexPct: 2,
        waccPct: 10.5,
        terminalGrowthPct: 2,
        historicalYearsUsed: 1,
      },
    })

    expect(rows[0]).toEqual({ year: 2025, revenue: 945_000, ebitda: 113_400 })
    expect(rows).toHaveLength(3)
  })

  it('returns empty when there is no usable actual base year', () => {
    expect(
      deriveDcfProjectionPreview({
        yearlyFinancials: [{ year: '2025', revenue: 500_000, ebitda: 50_000, isForecast: true }],
        revenueGrowthPct: 6,
        ebitdaMarginPct: 15,
      })
    ).toEqual([])
  })
})
