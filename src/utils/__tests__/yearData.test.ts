import { describe, expect, it } from 'vitest'
import { buildCurrentYearData, mergeYearDataRows, pickDefinedYearDataFields } from '../yearData'

describe('yearData helpers', () => {
  it('preserves zero-valued optional fields on current year data', () => {
    const result = buildCurrentYearData({
      year: 2025,
      revenue: 1_000_000,
      ebitda: 120_000,
      currentYearData: {
        cash: 0,
        total_debt: 0,
        current_assets: 250_000,
        current_liabilities: 0,
        depreciation: 35_000,
      },
    })

    expect(result).toMatchObject({
      year: 2025,
      revenue: 1_000_000,
      ebitda: 120_000,
      cash: 0,
      total_debt: 0,
      current_assets: 250_000,
      current_liabilities: 0,
      depreciation: 35_000,
    })
  })

  it('keeps imported year detail when overlaying edited revenue and ebitda rows', () => {
    const result = mergeYearDataRows(
      [{ year: 2024, revenue: 950_000, ebitda: 110_000 }],
      [
        {
          year: 2024,
          revenue: 900_000,
          ebitda: 100_000,
          depreciation: 30_000,
          nwc_change: -5_000,
        },
      ]
    )

    expect(result).toEqual([
      {
        year: 2024,
        revenue: 950_000,
        ebitda: 110_000,
        depreciation: 30_000,
        nwc_change: -5_000,
      },
    ])
  })

  it('lets explicit forecast row capex and nwc override imported defaults', () => {
    const result = mergeYearDataRows(
      [{ year: 2026, revenue: 1_100_000, ebitda: 140_000, capex: 40_000, nwc_change: -10_000, isForecast: true }],
      [
        {
          year: 2026,
          revenue: 1_050_000,
          ebitda: 130_000,
          capex: 30_000,
          nwc_change: 15_000,
          is_forecast: true,
        },
      ]
    )

    expect(result).toEqual([
      {
        year: 2026,
        revenue: 1_100_000,
        ebitda: 140_000,
        capex: 40_000,
        nwc_change: -10_000,
        is_forecast: true,
      },
    ])
  })

  it('omits non-finite optional values', () => {
    expect(
      pickDefinedYearDataFields({
        cash: Number.NaN,
        total_debt: Number.POSITIVE_INFINITY,
        depreciation: 20_000,
      })
    ).toEqual({
      depreciation: 20_000,
    })
  })
})
