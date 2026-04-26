import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import {
  getSeedBaseFilingYear,
  getSeedYearlyFinancials,
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

  it('keeps an explicit year when filing year is confirmed (even if all-zero)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'))
    const base = getSeedBaseFilingYear(
      {
        current_year_data: { year: 2024, revenue: 0, ebitda: 0 },
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
