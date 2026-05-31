import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  deriveManualDcfDefaultsProvenance,
  deriveManualDcfIntegrationCapexPct,
  deriveManualDcfIntegrationDaPct,
  getLatestManualDcfHistoricalMetrics,
  getManualDcfForecastRows,
} from './manualDcfForecastDerivations'

describe('manual DCF forecast derivations', () => {
  it('returns sorted forecast rows only when DCF is selected', () => {
    const rows = [
      { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
      { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
    ] as YearlyFinancials[]

    expect(getManualDcfForecastRows(true, rows).map((row) => row.year)).toEqual(['2025', '2026'])
    expect(getManualDcfForecastRows(false, rows)).toEqual([])
  })

  it('recognizes snake_case forecast rows restored from API-shaped session data', () => {
    const rows = [
      { year: '2026', revenue: 0, ebitda: 0, is_forecast: true },
      { year: '2024', revenue: 1_000_000, ebitda: 200_000 },
    ] as unknown as YearlyFinancials[]

    expect(getManualDcfForecastRows(true, rows).map((row) => row.year)).toEqual(['2026'])
  })

  it('uses the latest sorted historical row as the DCF baseline', () => {
    const rows = [
      { year: '2024', revenue: 1_200_000, ebitda: 240_000 },
      { year: '2023', revenue: 1_000_000, ebitda: 180_000 },
      { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
    ] as YearlyFinancials[]

    expect(getLatestManualDcfHistoricalMetrics(rows)).toEqual({
      latestHistoricalRevenue: 1_200_000,
      latestHistoricalEbitda: 240_000,
    })
  })

  it('skips non-positive placeholders and parses restored numeric strings for the baseline', () => {
    const rows = [
      { year: '2025', revenue: 0, ebitda: 0 },
      { year: '2024', revenue: '1.200.000', ebitda: '240.000' },
      { year: '2023', revenue: 1_000_000, ebitda: 180_000 },
    ] as unknown as YearlyFinancials[]

    expect(getLatestManualDcfHistoricalMetrics(rows)).toEqual({
      latestHistoricalRevenue: 1_200_000,
      latestHistoricalEbitda: 240_000,
    })
  })

  it('derives bounded import CapEx and D&A percentages from batch data first', () => {
    const businessContext = {
      _imported_ledger_analysis: {
        dcf_defaults: {
          suggested_capex: 10_000,
          average_depreciation: 10_000,
        },
      },
    } as ManualValuationFormData['business_context']
    const importBatchData = {
      dcf_defaults: {
        suggested_capex: 100_000,
        average_depreciation: 60_000,
      },
    }

    expect(
      deriveManualDcfIntegrationCapexPct({
        businessContext,
        importBatchData,
        latestHistoricalRevenue: 1_000_000,
      })
    ).toBe(8)
    expect(
      deriveManualDcfIntegrationDaPct({
        businessContext,
        importBatchData,
        latestHistoricalRevenue: 1_000_000,
      })
    ).toBe(5)
  })

  it('falls back to persisted ledger defaults when the import batch is absent', () => {
    const businessContext = {
      _imported_ledger_analysis: {
        dcf_defaults: {
          suggested_capex: 35_000,
          average_depreciation: 25_000,
        },
      },
    } as ManualValuationFormData['business_context']

    expect(
      deriveManualDcfIntegrationCapexPct({
        businessContext,
        importBatchData: null,
        latestHistoricalRevenue: 1_000_000,
      })
    ).toBe(3.5)
    expect(
      deriveManualDcfIntegrationDaPct({
        businessContext,
        importBatchData: null,
        latestHistoricalRevenue: 1_000_000,
      })
    ).toBe(2.5)
  })

  it('labels DCF default provenance deterministically', () => {
    const smartDefaults = {
      revenueGrowthPct: 5,
      ebitdaMarginPct: 20,
      capexPct: 4,
      daPct: 3,
      nwcPct: 1,
      taxRatePct: 25,
      waccPct: 10,
      terminalGrowthPct: 2,
    }

    expect(
      deriveManualDcfDefaultsProvenance({
        dcfSmartDefaultsFromHistory: null,
        integrationDerivedCapexPct: null,
        integrationDerivedDaPct: null,
      })
    ).toBe('none')
    expect(
      deriveManualDcfDefaultsProvenance({
        dcfSmartDefaultsFromHistory: null,
        integrationDerivedCapexPct: 3,
        integrationDerivedDaPct: null,
      })
    ).toBe('integration')
    expect(
      deriveManualDcfDefaultsProvenance({
        dcfSmartDefaultsFromHistory: smartDefaults,
        integrationDerivedCapexPct: null,
        integrationDerivedDaPct: null,
      })
    ).toBe('history')
    expect(
      deriveManualDcfDefaultsProvenance({
        dcfSmartDefaultsFromHistory: smartDefaults,
        integrationDerivedCapexPct: 3,
        integrationDerivedDaPct: null,
      })
    ).toBe('both')
  })
})
