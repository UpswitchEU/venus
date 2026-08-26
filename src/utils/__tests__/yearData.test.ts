import { describe, expect, it } from 'vitest'
import {
  buildCurrentYearData,
  buildForecastYearDataFromYearlyFinancials,
  isYearRowForecast,
  mergeYearDataRows,
  pickDefinedYearDataFields,
} from '../yearData'

describe('isYearRowForecast', () => {
  it('detects camelCase and snake_case forecast flags', () => {
    expect(isYearRowForecast({ isForecast: true })).toBe(true)
    expect(isYearRowForecast({ is_forecast: true })).toBe(true)
    expect(isYearRowForecast({ isForecast: false, is_forecast: false })).toBe(false)
    expect(isYearRowForecast(null)).toBe(false)
  })
})

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

  it('keeps source admission and warning metadata attached to the same fiscal-year row', () => {
    const result = mergeYearDataRows(
      [{ year: 2024, revenue: 950_000, ebitda: 910_000 }],
      [
        {
          year: 2024,
          revenue: 950_000,
          ebitda: 910_000,
          source_provider: 'silverfin',
          source_kind: 'live_accounting',
          source_synced_at: '2026-08-24T18:00:00.000Z',
          source_digest: 'a'.repeat(64),
          quality_state: 'source_warning',
          correction_id: 'correction-1',
          _source_reconciled: true,
          warning_codes: ['EXTREME_EBITDA_MARGIN'],
        },
      ]
    )

    expect(result[0]).toMatchObject({
      year: 2024,
      source_provider: 'silverfin',
      source_kind: 'live_accounting',
      source_synced_at: '2026-08-24T18:00:00.000Z',
      source_digest: 'a'.repeat(64),
      quality_state: 'source_warning',
      correction_id: 'correction-1',
      _source_reconciled: true,
      warning_codes: ['EXTREME_EBITDA_MARGIN'],
    })
  })

  it('lets explicit forecast row capex and nwc override imported defaults', () => {
    const result = mergeYearDataRows(
      [
        {
          year: 2026,
          revenue: 1_100_000,
          ebitda: 140_000,
          capex: 40_000,
          nwc_change: -10_000,
          isForecast: true,
        },
      ],
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

  it('lets explicit forecast depreciation override imported defaults', () => {
    const result = mergeYearDataRows(
      [
        {
          year: 2026,
          revenue: 1_100_000,
          ebitda: 140_000,
          depreciation: 22_000,
          isForecast: true,
        },
      ],
      [
        {
          year: 2026,
          revenue: 1_050_000,
          ebitda: 130_000,
          depreciation: 18_000,
          is_forecast: true,
        },
      ]
    )

    expect(result).toEqual([
      {
        year: 2026,
        revenue: 1_100_000,
        ebitda: 140_000,
        depreciation: 22_000,
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

  it('extracts meaningful forecast rows from localized yearly financial strings', () => {
    expect(
      buildForecastYearDataFromYearlyFinancials([
        { year: '2025', revenue: '1.000.000', ebitda: '100.000' },
        { year: '2026', revenue: '1.050.000', ebitda: '105.000', isForecast: true },
        { year: '2027', revenue: 0, ebitda: 0, isForecast: true },
        { year: '2028', revenue: 0, ebitda: 0, free_cash_flow: '0', isForecast: true },
      ])
    ).toEqual([
      { year: 2026, revenue: 1_050_000, ebitda: 105_000, is_forecast: true },
      { year: 2028, revenue: 0, ebitda: 0, free_cash_flow: 0, is_forecast: true },
    ])
  })

  it('strips stale free cash flow from EBITDA-mode forecast rows only', () => {
    const yearlyFinancials = [
      { year: '2025', revenue: '1.000.000', ebitda: '100.000' },
      {
        year: '2026',
        revenue: '1.050.000',
        ebitda: '105.000',
        free_cash_flow: '1',
        isForecast: true,
      },
    ]

    expect(buildForecastYearDataFromYearlyFinancials(yearlyFinancials)).toEqual([
      {
        year: 2026,
        revenue: 1_050_000,
        ebitda: 105_000,
        free_cash_flow: 1,
        is_forecast: true,
      },
    ])
    expect(
      buildForecastYearDataFromYearlyFinancials(yearlyFinancials, { dcfInputMode: 'ebitda' })
    ).toEqual([
      {
        year: 2026,
        revenue: 1_050_000,
        ebitda: 105_000,
        is_forecast: true,
      },
    ])
  })
})
