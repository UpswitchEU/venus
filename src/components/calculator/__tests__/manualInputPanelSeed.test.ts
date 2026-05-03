import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ValuationMethodResult } from '../../../types/valuation'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import {
  getSeedBaseFilingYear,
  getSeedYearlyFinancials,
  getSelectedBelgianAuditEntries,
  isSessionSeedYearStale,
  shouldAutoConfirmPrefilledFilingYear,
  shouldShowImportedAccountingSummary,
} from '../ManualInputPanel'

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
    expect(
      isSessionSeedYearStale({ filingYearConfirmed: true }, now)
    ).toBe(false)
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

describe('shouldShowImportedAccountingSummary', () => {
  it('does not show the old connect/import prompt for empty accounting prefill signals', () => {
    expect(
      shouldShowImportedAccountingSummary({
        importBatchData: null,
        importedLedgerAnalysis: null,
      })
    ).toBe(false)

    expect(
      shouldShowImportedAccountingSummary({
        importBatchData: null,
        importedLedgerAnalysis: {},
      })
    ).toBe(false)
  })

  it('shows only when imported accounting data has reviewable content', () => {
    expect(
      shouldShowImportedAccountingSummary({
        importedLedgerAnalysis: {
          sde_flags: [
            {
              ledger_code: '610000',
              ledger_name: 'Services and other goods',
              amount: 280_000,
              deviation_pct: 0.096,
              benchmark_median_pct: 0.03,
              benchmark_std_pct: 0.012,
              actual_pct_of_revenue: 0.144,
              z_score: 8,
              confidence: 0.9,
              year: 2025,
              potential_sde_addback: true,
              suggested_question: 'Review add-back',
              rationale: 'Above benchmark',
              category: 'discretionary_expense',
            },
          ],
        },
      })
    ).toBe(true)
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
    expect(entries[0]![0]).toBe('omzet_multiple')
    expect(entries[0]![1]).toBe(row)
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
