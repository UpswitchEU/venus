import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntegrationStatus } from '../../../services/api/accounting'
import type { ManualValuationFormData, ValuationMethodResult } from '../../../types/valuation'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { getNextHistoricalYear } from '../../../utils/forecastYears'
import { hasExplicitNumericValue } from '../../../utils/yearlyFinancials'
import {
  getSeedBaseFilingYear,
  getSeedYearlyFinancials,
  isSessionSeedYearStale,
  shouldAutoConfirmPrefilledFilingYear,
  venusLiveBatchImportProvider,
} from '../ManualInputPanel'
import type { NormalizationItem } from '../UnifiedNormalizationModal'
import { getSelectedBelgianAuditEntries } from '../utils/manualBelgianAuditEntries'
import { getLatestNonPlaceholderFinancialYear } from '../utils/manualFinancialSeeds'
import { buildManualInputNormalizedData } from '../utils/manualInputNormalizedData'

describe('getSeedBaseFilingYear / getSeedYearlyFinancials (filing year rollover)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('empty draft: basis follows current filing year on 2026-04-22 (not stale 2024)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        filingYearConfirmed: false,
      },
      new Date()
    )
    expect(base).toBe(2025)
  })

  it('does not move basis when a year row has real revenue (2024 stay)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 100_000, ebitda: 0 },
        filingYearConfirmed: false,
      },
      new Date()
    )
    expect(base).toBe(2024)
  })

  it('keeps a confirmed older year when real revenue is present (intentional choice)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 100_000, ebitda: 0 },
        filingYearConfirmed: true,
      },
      new Date()
    )
    expect(base).toBe(2024)
  })

  it('re-seeds default yearly columns from live filing year when only placeholders', () => {
    const now = new Date('2026-04-22T12:00:00.000Z')
    const yf = getSeedYearlyFinancials(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        yearlyFinancials: [
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
          { year: '2022', revenue: 0, ebitda: 0 },
        ],
        filingYearConfirmed: false,
      },
      now
    )
    const fy = getCurrentFilingYear(now)
    expect(yf.map((r) => r.year)).toEqual([String(fy), String(fy - 1), String(fy - 2)])
  })

  it('uses non-placeholder historical rows over placeholder current_year_data for the same basis year', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    const yf = getSeedYearlyFinancials(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        historical_years_data: [
          { year: 2024, revenue: 910_000, ebitda: 120_000 },
          { year: 2023, revenue: 840_000, ebitda: 112_000 },
          { year: 2022, revenue: 780_000, ebitda: 98_000 },
        ],
        yearlyFinancials: [
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
          { year: '2022', revenue: 0, ebitda: 0 },
        ],
      },
      now
    )

    expect(yf.find((r) => r.year === '2024')).toMatchObject({
      year: '2024',
      revenue: 910_000,
      ebitda: 120_000,
    })
  })
})

// Mirrors the (post-fix) header adjustment computation in NormalizedEbitdaSummary
// so the regression below proves the header reconciles with the per-year detail.
function headerAverageAdjustment(
  years: ReturnType<typeof buildManualInputNormalizedData>['years']
): number {
  const yearsWithEbitda = years.filter(
    (y) => !y.isForecast && hasExplicitNumericValue(y.ebitda) && Number(y.ebitda) !== 0
  )
  const sum = yearsWithEbitda.reduce(
    (acc, y) => acc + (Number.isFinite(y.totalAdjustment) ? y.totalAdjustment : 0),
    0
  )
  return yearsWithEbitda.length > 0 ? sum / yearsWithEbitda.length : 0
}

describe('single-FY2023-only financial history (phantom-row regression)', () => {
  // Real client file: the ONLY real data is FY2023 (revenue 177.376, reported
  // EBITDA 36.451, normalized 57.358 via 3 normalisaties). The integration left a
  // placeholder current_year_data at the calendar filing year (2025).
  const now = new Date('2026-06-28T12:00:00.000Z') // filing year = 2025
  const reportedEbitda = 36_451
  const revenue = 177_376
  // 3 normalisaties → +20.907 (57.358 − 36.451; the report shows +20.906 / 57.358,
  // the 1-euro delta is report rounding). The point of this test is reconciliation.
  const normalizations: NormalizationItem[] = [
    {
      id: 'n1',
      ledgerCode: '618',
      ledgerName: 'Management fee',
      category: 'salary',
      type: 'add',
      value: 0,
      adjustment: 12_000,
      source: 'manual',
      status: 'accepted',
      applyAllYears: false,
      year: 2023,
    },
    {
      id: 'n2',
      ledgerCode: '640',
      ledgerName: 'Eenmalige kost',
      category: 'one_time',
      type: 'add',
      value: 0,
      adjustment: 5_000,
      source: 'manual',
      status: 'accepted',
      applyAllYears: false,
      year: 2023,
    },
    {
      id: 'n3',
      ledgerCode: '623',
      ledgerName: 'Privégebruik',
      category: 'personal',
      type: 'add',
      value: 0,
      adjustment: 3_907,
      source: 'manual',
      status: 'accepted',
      applyAllYears: false,
      year: 2023,
    },
  ]

  const initialData: Partial<ManualValuationFormData> = {
    current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
    historical_years_data: [{ year: 2023, revenue, ebitda: reportedEbitda }],
    filingYearConfirmed: false,
  }

  it('anchors the base year on the real FY2023 data, not the calendar filing year', () => {
    expect(getLatestNonPlaceholderFinancialYear(initialData)).toBe(2023)
    expect(getSeedBaseFilingYear(initialData, now)).toBe(2023)
  })

  it('seeds a ladder that LEADS with FY2023 (no phantom empty 2025/2024 rows)', () => {
    const yf = getSeedYearlyFinancials(initialData, now)
    // First (newest) row is the real 2023 "Basis" year — no leading 2025/2024.
    expect(yf[0]).toMatchObject({ year: '2023', revenue, ebitda: reportedEbitda })
    expect(yf.some((r) => r.year === '2025')).toBe(false)
    expect(yf.some((r) => r.year === '2024')).toBe(false)
  })

  it('add-year offers the internal gap year before extending below the minimum', () => {
    // Rows skip 2024 between 2025 and 2023 → offer 2024, not 2022.
    const withGap = [
      { year: '2025', revenue: 1, ebitda: 1 },
      { year: '2023', revenue: 1, ebitda: 1 },
    ]
    expect(getNextHistoricalYear(withGap)).toBe(2024)
    // Contiguous set → extend below the oldest.
    expect(
      getNextHistoricalYear([
        { year: '2025', revenue: 1, ebitda: 1 },
        { year: '2024', revenue: 1, ebitda: 1 },
        { year: '2023', revenue: 1, ebitda: 1 },
      ])
    ).toBe(2022)
  })

  it('header adjustment reconciles with the per-year detail (+20.907, 1 jaar)', () => {
    const yearlyFinancials = getSeedYearlyFinancials(initialData, now)
    const normalizedData = buildManualInputNormalizedData({
      estimatedMarketRent: undefined,
      excludeRealEstate: false,
      normalizationItems: normalizations,
      yearlyFinancials,
    })

    // "(1 jaar)" — only the real FY2023 counts as a complete year.
    expect(normalizedData.totalYearsWithData).toBe(1)

    const year2023 = normalizedData.years.find((y) => y.year === '2023')
    expect(year2023?.totalAdjustment).toBe(20_907)
    expect(year2023?.normalizedEbitda).toBe(57_358)

    // Header must equal the per-year detail — NOT half of it (the old bug divided
    // the +20.907 by 2 because a phantom 0-EBITDA row inflated the denominator).
    const header = headerAverageAdjustment(normalizedData.years)
    expect(header).toBe(20_907)
    expect(header).toBe(year2023?.totalAdjustment)
  })

  it('EBITDA margin shown under the normalized figure is 32.3% (not the reported 20.6%)', () => {
    const yearlyFinancials = getSeedYearlyFinancials(initialData, now)
    const normalizedData = buildManualInputNormalizedData({
      estimatedMarketRent: undefined,
      excludeRealEstate: false,
      normalizationItems: normalizations,
      yearlyFinancials,
    })
    const year2023 = normalizedData.years.find((y) => y.year === '2023')
    const normalizedMargin = ((year2023?.normalizedEbitda ?? 0) / revenue) * 100
    const reportedMargin = (reportedEbitda / revenue) * 100
    expect(normalizedMargin.toFixed(1)).toBe('32.3')
    expect(reportedMargin.toFixed(1)).toBe('20.6')
  })
})

describe('isSessionSeedYearStale (Jan–Mar 2026 → April rollover heal)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flags a confirmed prior year with no real numbers as stale', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    expect(
      isSessionSeedYearStale(
        {
          current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
          filingYearConfirmed: true,
        },
        now
      )
    ).toBe(true)
  })

  it('does NOT flag stale when real revenue has been entered', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    expect(
      isSessionSeedYearStale(
        {
          current_year_data: { year: 2024, revenue: 100_000, ebitda: 0 },
          filingYearConfirmed: true,
        },
        now
      )
    ).toBe(false)
  })

  it('does NOT flag stale when saved year matches live filing year', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    expect(
      isSessionSeedYearStale(
        {
          current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
          filingYearConfirmed: true,
        },
        now
      )
    ).toBe(false)
  })

  it('does NOT flag stale when no current_year_data is persisted', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    expect(isSessionSeedYearStale({ filingYearConfirmed: true }, now)).toBe(false)
  })
})

describe('getSeedYearlyFinancials heals stale Jan–Mar seed', () => {
  it('regenerates rows around the live filing year when persisted year is stale', () => {
    const now = new Date('2026-05-03T12:00:00.000Z')
    const yf = getSeedYearlyFinancials(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        yearlyFinancials: [
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
          { year: '2022', revenue: 0, ebitda: 0 },
        ],
        filingYearConfirmed: true,
      },
      now
    )
    const fy = getCurrentFilingYear(now)
    // Heals to live filing year even though session had filingYearConfirmed=true
    expect(yf.map((r) => r.year)).toEqual([String(fy), String(fy - 1), String(fy - 2)])
  })
})

describe('shouldAutoConfirmPrefilledFilingYear refuses to re-confirm stale seed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for a stale (confirmed but data-less older year) initialData', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'))
    const result = shouldAutoConfirmPrefilledFilingYear(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
        filingYearConfirmed: true,
      },
      getCurrentFilingYear()
    )
    expect(result).toBe(false)
  })

  it('still returns true when real revenue exists', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'))
    const result = shouldAutoConfirmPrefilledFilingYear(
      {
        current_year_data: { year: 2024, revenue: 100_000, ebitda: 0 },
        filingYearConfirmed: true,
      },
      getCurrentFilingYear()
    )
    expect(result).toBe(true)
  })
})

describe('venusLiveBatchImportProvider', () => {
  it('returns null when disconnected or missing row', () => {
    expect(venusLiveBatchImportProvider(null)).toBe(null)
    expect(
      venusLiveBatchImportProvider({
        provider: 'bizzcontrol',
        is_connected: false,
      } satisfies IntegrationStatus)
    ).toBe(null)
  })

  it('returns bizzcontrol or octopus only when connected', () => {
    expect(
      venusLiveBatchImportProvider({
        provider: 'bizzcontrol',
        is_connected: true,
      } satisfies IntegrationStatus)
    ).toBe('bizzcontrol')
    expect(
      venusLiveBatchImportProvider({
        provider: 'octopus',
        is_connected: true,
      } satisfies IntegrationStatus)
    ).toBe('octopus')
  })

  it('ignores Silverfin and other providers for in-panel batch import', () => {
    expect(
      venusLiveBatchImportProvider({
        provider: 'silverfin',
        is_connected: true,
      } satisfies IntegrationStatus)
    ).toBe(null)
    expect(
      venusLiveBatchImportProvider({
        provider: 'yuki',
        is_connected: true,
      } satisfies IntegrationStatus)
    ).toBe(null)
  })
})

describe('getSelectedBelgianAuditEntries', () => {
  it('only returns audit panels for the selected valuation method', () => {
    const entries = getSelectedBelgianAuditEntries({
      effectiveMethod: 'upswitch_adaptive',
      effectiveMethods: ['upswitch_adaptive'],
      valuationResults: {
        upswitch_adaptive: {
          available: true,
          label: 'UpSwitch Adaptive',
          value: 1_000_000,
          details: { sde_bridge: [{ label: 'Normalized EBITDA' }] },
        },
        adjusted_nav: {
          available: true,
          label: 'Adjusted NAV',
          value: 900_000,
          details: { sme_eligibility: { is_eligible: true, rate_pct: 20, reasons: [] } },
        },
      } satisfies Record<string, ValuationMethodResult>,
    })

    expect(entries.map(([methodKey]) => methodKey)).toEqual(['upswitch_adaptive'])
  })

  it('resolves omzet selection to revenue_multiple row when details live under the EN key', () => {
    const row: ValuationMethodResult = {
      available: true,
      label: 'Revenue multiple',
      value: 500_000,
      details: { foo: true } as ValuationMethodResult['details'],
    }
    const entries = getSelectedBelgianAuditEntries({
      effectiveMethod: 'omzet_multiple',
      effectiveMethods: ['omzet_multiple'],
      valuationResults: { revenue_multiple: row },
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.[0]).toBe('omzet_multiple')
    expect(entries[0]?.[1]).toBe(row)
  })

  it('dedupes one audit panel when blend lists both omzet and revenue aliases of the same row', () => {
    const shared: ValuationMethodResult = {
      available: true,
      label: 'Omzet',
      value: 1,
      details: { bar: true } as ValuationMethodResult['details'],
    }
    const entries = getSelectedBelgianAuditEntries({
      effectiveMethod: 'omzet_multiple',
      effectiveMethods: ['ebitda_multiple', 'omzet_multiple', 'revenue_multiple'],
      valuationResults: {
        ebitda_multiple: {
          available: true,
          label: 'E',
          value: 2,
          details: { e: true } as ValuationMethodResult['details'],
        },
        omzet_multiple: shared,
        revenue_multiple: shared,
      },
    })
    expect(entries.map(([k]) => k)).toEqual(['ebitda_multiple', 'omzet_multiple'])
  })
})
