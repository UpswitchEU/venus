// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getSeedYearlyFinancials } from '@/components/calculator/utils/manualFinancialSeeds'
import { buildManualInputNormalizedData } from '@/components/calculator/utils/manualInputNormalizedData'
import { buildManualLiveYearlyFinancials } from '@/features/manual/utils/manualLiveYearlyFinancials'
import type { YearDataInput, YearlyFinancials } from '@/types/valuation'
import { buildYearlyFinancialsFromCurrentAndHistorical, turnoverOf } from '@/utils/yearlyFinancials'

const now = new Date('2026-10-03T12:00:00Z')
const normalized = {
  year: 2025,
  revenue: 1_450_000,
  ebitda: 491_500,
  ebitda_normalized: true,
  normalized_ebitda: 491_500,
  reported_ebitda: 335_000,
}
const builders: Record<
  string,
  (current: YearDataInput, historical?: YearDataInput[]) => YearlyFinancials[]
> = {
  prefill: (current, historical) =>
    buildYearlyFinancialsFromCurrentAndHistorical(current, historical),
  seed: (current, historical) =>
    getSeedYearlyFinancials({ current_year_data: current, historical_years_data: historical }, now),
  live: (current, historical) =>
    buildManualLiveYearlyFinancials({
      formData: { current_year_data: current, historical_years_data: historical },
    }),
}

describe.each(Object.entries(builders))('%s financial restoration', (_name, build) => {
  it('keeps the current observation ahead of a stale historical copy', () => {
    const rows = build(normalized, [{ year: 2025, revenue: 999_000, ebitda: 90_000 }])
    expect(rows.find((row) => row.year === '2025')).toMatchObject({
      revenue: 1_450_000,
      ebitda: 335_000,
    })
  })

  it('applies an accepted adjustment exactly once after restoring a normalized request', () => {
    const rows = build(normalized)
    const result = buildManualInputNormalizedData({
      yearlyFinancials: rows,
      excludeRealEstate: false,
      estimatedMarketRent: undefined,
      normalizationItems: [
        {
          id: 'reviewed',
          ledgerCode: '620',
          ledgerName: 'Owner compensation',
          category: 'salary',
          type: 'add',
          value: 156_500,
          adjustment: 156_500,
          source: 'manual',
          status: 'accepted',
          applyAllYears: false,
          year: 2025,
        },
      ],
    })
    expect(result.years.find((row) => row.year === '2025')?.normalizedEbitda).toBe(491_500)
  })

  it('preserves missing EBITDA as missing, and explicit zero as zero', () => {
    expect(build({ year: 2025, revenue: 1_000 } as YearDataInput)[0].ebitda).toBeUndefined()
    expect(build({ year: 2025, revenue: 1_000, ebitda: 0 })[0].ebitda).toBe(0)
  })

  it('does not substitute normalized earnings for a missing reported baseline', () => {
    expect(build({ ...normalized, reported_ebitda: undefined })[0].ebitda).toBeUndefined()
    expect(build({ ...normalized, reported_ebitda: 0 })[0].ebitda).toBe(0)
    expect(
      build({ ...normalized, normalized_ebitda: Number.NaN, reported_ebitda: 335_000 })[0].ebitda
    ).toBe(335_000)
  })

  it('carries the supporting cash-flow and source evidence into the restored grid', () => {
    const evidence = {
      free_cash_flow: -12.5,
      capex: 0,
      lease_liabilities: 50,
      total_assets: 700,
      total_liabilities: 300,
      total_equity: 400,
      correction_id: 'correction-1',
      source_digest: 'digest',
      quality_state: 'advisor_corrected',
      warning_codes: ['REVIEWED'],
      _source_reconciled: true,
    }
    expect(build({ ...normalized, ...evidence })[0]).toMatchObject(evidence)
  })

  it('uses reconciled turnover consistently', () => {
    expect(
      build({
        year: 2025,
        revenue: 1_050_000,
        operating_revenue: 1_000_000,
        financial_income: 50_000,
        ebitda: 100_000,
      } as YearDataInput)[0].revenue
    ).toBe(1_000_000)
  })
})

it('does not erase small revenue corrections using a percentage tolerance', () => {
  expect(
    turnoverOf({ revenue: 1_050_001, operating_revenue: 1_000_000, financial_income: 50_000 })
  ).toBe(1_050_001)
})

it('does not treat malformed excluded income as zero', () => {
  expect(
    turnoverOf({ revenue: 1_000_000, operating_revenue: 999_500, financial_income: 'invalid' })
  ).toBe(1_000_000)
})

it('does not turn partial or fractional year labels into fiscal periods', () => {
  const rows = buildYearlyFinancialsFromCurrentAndHistorical(null, [
    { year: '2025 draft', revenue: 100, ebitda: 10 },
    { year: 2024.5, revenue: 100, ebitda: 10 },
  ] as unknown as YearDataInput[])
  expect(rows).toEqual([])
  expect(
    buildManualLiveYearlyFinancials({
      formData: { current_year_data: { year: 2024.5, revenue: 100, ebitda: 10 } },
    })
  ).toEqual([])
})
