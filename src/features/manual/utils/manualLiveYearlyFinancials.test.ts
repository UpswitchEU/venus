// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualLiveYearlyFinancials } from './manualLiveYearlyFinancials'

describe('manualLiveYearlyFinancials', () => {
  it('prefers latest yearly financial rows and sorts them descending', () => {
    expect(
      buildManualLiveYearlyFinancials({
        latestYearlyFinancials: [
          { year: '2023', revenue: 80, ebitda: 8 },
          { year: '2025', revenue: 100, ebitda: 10 },
        ],
        formData: {},
      }).map((row) => row.year)
    ).toEqual(['2025', '2023'])
  })

  it('builds current, historical, and forecast rows from store form data', () => {
    const rows = buildManualLiveYearlyFinancials({
      formData: {
        current_year_data: {
          year: 2025,
          revenue: 100,
          ebitda: 10,
          capex: 3,
          depreciation: 2,
        },
        historical_years_data: [
          {
            year: 2024,
            revenue: 90,
            ebitda: 9,
            cash: 5,
            total_debt: 12,
            nwc_change: 1,
          },
        ],
        forecast_years_data: [{ year: 2026, revenue: 120, ebitda: 14, capex: 4 }],
      },
    })

    expect(rows).toEqual([
      {
        year: '2026',
        revenue: 120,
        ebitda: 14,
        capex: 4,
        depreciation: undefined,
        tax_expense: undefined,
        cash: undefined,
        total_debt: undefined,
        current_assets: undefined,
        current_liabilities: undefined,
        accounts_receivable: undefined,
        accounts_payable: undefined,
        inventory: undefined,
        short_term_debt: undefined,
        nwc_change: undefined,
        isForecast: true,
      },
      {
        year: '2025',
        revenue: 100,
        ebitda: 10,
        capex: 3,
        depreciation: 2,
        tax_expense: undefined,
        cash: undefined,
        total_debt: undefined,
        current_assets: undefined,
        current_liabilities: undefined,
        accounts_receivable: undefined,
        accounts_payable: undefined,
        inventory: undefined,
        short_term_debt: undefined,
        nwc_change: undefined,
      },
      {
        year: '2024',
        revenue: 90,
        ebitda: 9,
        capex: undefined,
        depreciation: undefined,
        tax_expense: undefined,
        cash: 5,
        total_debt: 12,
        current_assets: undefined,
        current_liabilities: undefined,
        accounts_receivable: undefined,
        accounts_payable: undefined,
        inventory: undefined,
        short_term_debt: undefined,
        nwc_change: 1,
      },
    ])
  })

  it('skips invalid and duplicate years while preserving current-year priority', () => {
    expect(
      buildManualLiveYearlyFinancials({
        formData: {
          current_year_data: { year: 2025, revenue: '100', ebitda: '10' },
          historical_years_data: [
            { year: 2025, revenue: 90, ebitda: 9 },
            { year: 1999, revenue: 80, ebitda: 8 },
          ],
        },
      })
    ).toEqual([
      expect.objectContaining({
        year: '2025',
        revenue: 100,
        ebitda: 10,
      }),
    ])
  })

  it('preserves audited source metadata when hydrating live rows', () => {
    expect(
      buildManualLiveYearlyFinancials({
        formData: {
          historical_years_data: [
            {
              year: 2024,
              revenue: 950_000,
              ebitda: 910_000,
              source_provider: 'silverfin',
              source_kind: 'live_accounting',
              source_synced_at: '2026-08-24T18:00:00.000Z',
              source_digest: 'b'.repeat(64),
              quality_state: 'attested_review',
              attestation_id: 'attestation-1',
            },
          ],
        },
      })
    ).toEqual([
      expect.objectContaining({
        year: '2024',
        source_provider: 'silverfin',
        source_kind: 'live_accounting',
        source_synced_at: '2026-08-24T18:00:00.000Z',
        source_digest: 'b'.repeat(64),
        quality_state: 'attested_review',
        attestation_id: 'attestation-1',
      }),
    ])
  })
})
