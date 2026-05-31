import { describe, expect, it } from 'vitest'
import {
  applyDcfProjectionPreviewToForecastRows,
  buildProjectionRowFromForecastRow,
  deriveDcfProjectionPreview,
} from './dcfProjectionPreview'

describe('deriveDcfProjectionPreview', () => {
  it('projects three years with full FCFF waterfall', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [
        { year: '2023', revenue: 1_000_000, ebitda: 150_000 },
        { year: '2024', revenue: 1_200_000, ebitda: 216_000 },
      ],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      capexPct: 4,
      daPct: 3,
      nwcPct: 1.5,
      taxRatePct: 25,
    })

    expect(rows).toHaveLength(3)
    expect(rows[0].year).toBe(2025)
    expect(rows[0].revenue).toBe(1_320_000)
    expect(rows[0].ebitda).toBe(264_000)

    // D&A = 3% of 1,320,000 = 39,600
    expect(rows[0].da).toBe(39_600)
    // EBIT = 264,000 - 39,600 = 224,400
    expect(rows[0].ebit).toBe(224_400)
    // Taxes = 224,400 * 0.25 = 56,100
    expect(rows[0].taxes).toBe(56_100)
    // NOPAT = 224,400 - 56,100 = 168,300
    expect(rows[0].nopat).toBe(168_300)
    // CapEx = 4% of 1,320,000 = 52,800
    expect(rows[0].capex).toBe(52_800)
    // NWC = 1.5% of 1,320,000 = 19,800
    expect(rows[0].nwcChange).toBe(19_800)
    // FCFF = 168,300 + 39,600 - 52,800 - 19,800 = 135,300
    expect(rows[0].fcff).toBe(135_300)
  })

  it('falls back to smart defaults when explicit inputs are missing', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2024', revenue: 900_000, ebitda: 90_000 }],
      smartDefaults: {
        revenueGrowthPct: 5,
        ebitdaMarginPct: 12,
        capexPct: 2,
        daPct: 2,
        taxRatePct: 25,
        waccPct: 10.5,
        terminalGrowthPct: 2,
        exitMultiple: 6,
        historicalYearsUsed: 1,
      },
    })

    expect(rows[0].year).toBe(2025)
    expect(rows[0].revenue).toBe(945_000)
    expect(rows[0].ebitda).toBe(113_400)
    expect(rows[0].fcff).toBeDefined()
    expect(rows).toHaveLength(3)
  })

  it('compounds to the exact forecast years that exist in the table', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 150_000 }],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      forecastYears: [2027, 2028],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0].revenue).toBe(1_210_000)
    expect(rows[0].ebitda).toBe(242_000)
    expect(rows[1].revenue).toBe(1_331_000)
    expect(rows[1].ebitda).toBe(266_200)
    expect(rows[0].fcff).toBeDefined()
  })

  it('applies projected values including cash flow drivers onto forecast rows', () => {
    const projectedRows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 150_000 }],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      capexPct: 4,
      daPct: 3,
      nwcPct: 1.5,
      taxRatePct: 25,
      forecastYears: [2026, 2027],
    })

    const result = applyDcfProjectionPreviewToForecastRows(
      [
        { year: '2025', revenue: 1_000_000, ebitda: 150_000 },
        { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
        { year: '2027', revenue: 0, ebitda: 0, isForecast: true },
      ],
      projectedRows
    )

    // Historical row unchanged
    expect(result[0]).toEqual({ year: '2025', revenue: 1_000_000, ebitda: 150_000 })
    // Forecast rows get revenue, ebitda, capex, depreciation, nwc_change
    expect(result[1].revenue).toBe(1_100_000)
    expect(result[1].ebitda).toBe(220_000)
    expect(result[1].capex).toBe(44_000)
    expect(result[1].depreciation).toBe(33_000)
    expect(result[1].nwc_change).toBe(16_500)
  })

  it('uses explicit free_cash_flow when provided', () => {
    const row = buildProjectionRowFromForecastRow(
      {
        year: '2026',
        revenue: 0,
        ebitda: 0,
        free_cash_flow: 125_000,
      },
      { daPct: 3, capexPct: 4, nwcPct: 1.5, taxRatePct: 25 }
    )
    expect(row.fcff).toBe(125_000)
    expect(row.da).toBe(0)
  })

  it('applyDcfProjectionPreviewToForecastRows maps FCFF-only mode to free_cash_flow', () => {
    const projectedRows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 150_000 }],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      forecastYears: [2026],
    })
    const result = applyDcfProjectionPreviewToForecastRows(
      [{ year: '2026', revenue: 0, ebitda: 0, isForecast: true }],
      projectedRows,
      { mode: 'fcff_only' }
    )
    expect(result[0].free_cash_flow).toBe(projectedRows[0].fcff)
    expect(result[0].revenue).toBe(0)
    expect(result[0].ebitda).toBe(0)
  })

  it('buildProjectionRowFromForecastRow matches deriveDcfProjectionPreview for same inputs', () => {
    const fromDerive = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2024', revenue: 1_000_000, ebitda: 100_000 }],
      revenueGrowthPct: 3,
      ebitdaMarginPct: 10,
      capexPct: 4,
      daPct: 3,
      nwcPct: 1.5,
      taxRatePct: 25,
      forecastYears: [2025],
    })[0]
    const fromBuild = buildProjectionRowFromForecastRow(
      {
        year: '2025',
        revenue: fromDerive.revenue,
        ebitda: fromDerive.ebitda,
      },
      { daPct: 3, capexPct: 4, nwcPct: 1.5, taxRatePct: 25 }
    )
    expect(fromBuild.fcff).toBe(fromDerive.fcff)
    expect(fromBuild.nopat).toBe(fromDerive.nopat)
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

  it('ignores snake_case forecast rows when choosing the actual projection base', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [
        { year: '2024', revenue: 1_000_000, ebitda: 100_000 },
        { year: '2025', revenue: 999_000, ebitda: 999_000, is_forecast: true },
      ],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
    })

    expect(rows[0].year).toBe(2025)
    expect(rows[0].revenue).toBe(1_100_000)
    expect(rows[0].ebitda).toBe(220_000)
  })

  it('ignores non-positive actual rows when choosing the projection base', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [
        { year: '2024', revenue: 900_000, ebitda: 90_000 },
        { year: '2025', revenue: 0, ebitda: 0 },
      ],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      forecastYears: [2025],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].year).toBe(2025)
    expect(rows[0].revenue).toBe(990_000)
    expect(rows[0].ebitda).toBe(198_000)
  })

  it('accepts persisted numeric strings when deriving projections', () => {
    const rows = deriveDcfProjectionPreview({
      yearlyFinancials: [{ year: '2024', revenue: '900.000', ebitda: '90.000' }],
      revenueGrowthPct: 10,
      ebitdaMarginPct: 20,
      forecastYears: [2025],
    })

    expect(rows[0].revenue).toBe(990_000)
    expect(rows[0].ebitda).toBe(198_000)
  })

  it('applies projected values onto snake_case forecast rows', () => {
    const result = applyDcfProjectionPreviewToForecastRows(
      [{ year: '2026', revenue: 0, ebitda: 0, is_forecast: true }],
      [
        {
          year: 2026,
          revenue: 1_100_000,
          ebitda: 220_000,
          da: 33_000,
          ebit: 187_000,
          taxes: 46_750,
          nopat: 140_250,
          capex: 44_000,
          nwcChange: 16_500,
          fcff: 112_750,
        },
      ]
    )

    expect(result[0].revenue).toBe(1_100_000)
    expect(result[0].ebitda).toBe(220_000)
    expect(result[0].capex).toBe(44_000)
    expect(result[0].depreciation).toBe(33_000)
    expect(result[0].nwc_change).toBe(16_500)
  })
})
