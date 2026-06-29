import { describe, expect, it } from 'vitest'
import type { DcfForecastRow } from './DcfForecastTypes'
import type { DcfProjectionPreviewRow } from './dcfProjectionPreview'
import { buildDcfWorkspaceProjectionRows } from './dcfWorkspaceProjectionRows'

const derivedRow: DcfProjectionPreviewRow = {
  year: 2026,
  revenue: 1_050_000,
  ebitda: 105_000,
  da: 21_000,
  ebit: 84_000,
  taxes: 21_000,
  nopat: 63_000,
  capex: 21_000,
  nwcChange: 750,
  fcff: 62_250,
}

describe('buildDcfWorkspaceProjectionRows', () => {
  it('ignores stale FCFF residue when deriving EBITDA-mode preview rows', () => {
    const rows = buildDcfWorkspaceProjectionRows({
      dcfInputMode: 'ebitda',
      latestHistoricalRevenue: 1_000_000,
      sortedRows: [
        {
          year: '2026',
          revenue: 0,
          ebitda: 0,
          free_cash_flow: 1,
          isForecast: true,
        },
      ] as DcfForecastRow[],
      derivedProjectionPreview: [derivedRow],
    })

    expect(rows).toEqual([derivedRow])
  })

  it('does not let stale FCFF override a stored EBITDA bridge row', () => {
    const rows = buildDcfWorkspaceProjectionRows({
      dcfInputMode: 'ebitda',
      latestHistoricalRevenue: 1_000_000,
      globalCapexPct: 2,
      globalDaPct: 2,
      globalNwcPct: 1.5,
      globalTaxRatePct: 25,
      sortedRows: [
        {
          year: '2026',
          revenue: 1_050_000,
          ebitda: 105_000,
          free_cash_flow: 1,
          isForecast: true,
        },
      ] as DcfForecastRow[],
    })

    expect(rows[0]).toMatchObject({
      revenue: 1_050_000,
      ebitda: 105_000,
      fcff: 62_250,
    })
  })

  it('uses explicit free cash flow in FCFF-only mode', () => {
    const rows = buildDcfWorkspaceProjectionRows({
      dcfInputMode: 'fcff_only',
      latestHistoricalRevenue: 1_000_000,
      sortedRows: [
        {
          year: '2026',
          revenue: 0,
          ebitda: 0,
          free_cash_flow: 75_000,
          isForecast: true,
        },
      ] as DcfForecastRow[],
    })

    expect(rows[0]).toMatchObject({
      revenue: 0,
      ebitda: 0,
      fcff: 75_000,
    })
  })
})
