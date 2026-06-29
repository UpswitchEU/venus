// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualRestoredFinancialSnapshot } from './manualRestoredFinancialSnapshot'

describe('manualRestoredFinancialSnapshot', () => {
  it('builds a restored dirty-state baseline from current, historical, and forecast rows', () => {
    expect(
      buildManualRestoredFinancialSnapshot({
        current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
        historical_years_data: [{ year: 2024, revenue: 90, ebitda: 9, capex: 3, nwc_change: 1 }],
        forecast_years_data: [{ year: 2026, revenue: 120, ebitda: 12, capex: 4 }],
      })
    ).toEqual({
      revenue: 100,
      ebitda: 10,
      yearlyFinancials: [
        {
          year: '2026',
          revenue: 120,
          ebitda: 12,
          capex: 4,
          nwc_change: undefined,
          isForecast: true,
        },
        {
          year: '2025',
          revenue: 100,
          ebitda: 10,
          capex: undefined,
          nwc_change: undefined,
        },
        {
          year: '2024',
          revenue: 90,
          ebitda: 9,
          capex: 3,
          nwc_change: 1,
        },
      ],
    })
  })

  it('uses top-level revenue and EBITDA when current year data is absent', () => {
    expect(
      buildManualRestoredFinancialSnapshot({
        revenue: 500,
        ebitda: 50,
        historical_years_data: [{ year: 2024, revenue: 90, ebitda: 9 }],
      })
    ).toMatchObject({
      revenue: 500,
      ebitda: 50,
    })
  })

  it('preserves Belgian/Dutch persisted number strings when restoring financial rows', () => {
    expect(
      buildManualRestoredFinancialSnapshot({
        current_year_data: { year: 2025, revenue: '1.000.000', ebitda: '100.000' },
        historical_years_data: [{ year: 2024, revenue: '900.000', ebitda: '90.000' }],
        forecast_years_data: [
          { year: 2026, revenue: '1.050.000', ebitda: '105.000', capex: '21.000' },
        ],
      })
    ).toMatchObject({
      revenue: 1_000_000,
      ebitda: 100_000,
      yearlyFinancials: [
        { year: '2026', revenue: 1_050_000, ebitda: 105_000, capex: 21_000, isForecast: true },
        { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
        { year: '2024', revenue: 900_000, ebitda: 90_000 },
      ],
    })
  })

  it('returns null when no restored financial rows are meaningful', () => {
    expect(buildManualRestoredFinancialSnapshot(null)).toBeNull()
    expect(
      buildManualRestoredFinancialSnapshot({
        current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
        historical_years_data: [{ year: 2024, revenue: 0, ebitda: 0 }],
        forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0 }],
      })
    ).toBeNull()
  })

  it('keeps explicit forecast structure when capex or working capital is present', () => {
    expect(
      buildManualRestoredFinancialSnapshot({
        forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, nwc_change: 1 }],
      })?.yearlyFinancials
    ).toEqual([
      {
        year: '2026',
        revenue: 0,
        ebitda: 0,
        capex: undefined,
        nwc_change: 1,
        isForecast: true,
      },
    ])
  })
})
