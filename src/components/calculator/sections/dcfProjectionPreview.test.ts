import { describe, expect, it } from 'vitest'
import {
  applyDcfProjectionPreviewToForecastRows,
  deriveDcfProjectionPreview,
} from './dcfProjectionPreview'

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

  it('compounds to the exact forecast years that exist in the table', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 150_000 }],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      forecastYears: [2027, 2028],
    })

    expect(rows).toEqual([
      { year: 2027, revenue: 1_210_000, ebitda: 242_000 },
      { year: 2028, revenue: 1_331_000, ebitda: 266_200 },
    ])
  })

  it('applies projected revenue and EBITDA onto forecast rows only', () => {
    const projectedRows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 150_000 }],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      forecastYears: [2026, 2027],
    })

    expect(
      applyDcfProjectionPreviewToForecastRows(
        [
          { year: '2025', revenue: 1_000_000, ebitda: 150_000 },
          { year: '2026', revenue: 0, ebitda: 0, capex: 40_000, isForecast: true },
          { year: '2027', revenue: 0, ebitda: 0, capex: 45_000, isForecast: true },
        ],
        projectedRows
      )
    ).toEqual([
      { year: '2025', revenue: 1_000_000, ebitda: 150_000 },
      { year: '2026', revenue: 1_100_000, ebitda: 220_000, capex: 40_000, isForecast: true },
      { year: '2027', revenue: 1_210_000, ebitda: 242_000, capex: 45_000, isForecast: true },
    ])
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
