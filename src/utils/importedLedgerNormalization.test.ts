import { describe, expect, it } from 'vitest'
import {
  buildNormalizationItemsFromImportedLedgerAnalysis,
  buildReportedEbitdaByYearFromFormRecords,
  normalizeImportedLedgerReviewStatuses,
} from './importedLedgerNormalization'

describe('buildReportedEbitdaByYearFromFormRecords', () => {
  it('merges current, historical, and yearly financial rows', () => {
    expect(
      buildReportedEbitdaByYearFromFormRecords({
        currentYearData: { year: 2024, ebitda: 50_000 },
        historicalYearsData: [{ year: 2023, ebitda: 40_000 }],
        yearlyFinancials: [
          { year: 2022, ebitda: 30_000 },
          { year: 2025, ebitda: 999, isForecast: true },
        ],
      })
    ).toEqual({ 2024: 50_000, 2023: 40_000, 2022: 30_000 })
  })

  it('uses imported yearData and scalar fallback EBITDA before auto-accepting imported flags', () => {
    expect(
      buildReportedEbitdaByYearFromFormRecords({
        yearData: { 2021: { ebitda: 180_000 } },
        fallbackYear: 2024,
        fallbackEbitda: 260_000,
      })
    ).toEqual({ 2021: 180_000, 2024: 260_000 })
  })
})

describe('buildNormalizationItemsFromImportedLedgerAnalysis', () => {
  it('keeps extreme auto-addbacks pending when they exceed the defensibility cap', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      reported_ebitda_by_year: { 2023: 100_000 },
      sde_flags: [
        {
          ledger_code: '610000',
          ledger_name: 'Services and other goods',
          amount: 300_000,
          suggested_question: 'Review discretionary spend?',
          year: 2023,
        },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('pending')
    expect(items[0].adjustment).toBe(300_000)
  })

  it('accepts imported addbacks when reported EBITDA keeps them within the cap', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      reported_ebitda_by_year: { 2023: 100_000 },
      sde_flags: [
        {
          ledger_code: '610000',
          ledger_name: 'Services and other goods',
          amount: 20_000,
          suggested_question: 'Review discretionary spend?',
          year: 2023,
        },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('accepted')
  })

  it('keeps SDE flags pending when reported EBITDA is unavailable', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      latest_fiscal_year: 2024,
      sde_flags: [
        {
          ledger_code: '600',
          ledger_name: 'Owner salary',
          amount: 120_000,
          suggested_question: 'Normalize owner comp?',
          category: 'owner_compensation',
          year: 2023,
          confidence: 0.85,
          benchmark_median_pct: 0.05,
        },
      ],
      dcf_defaults: { suggested_capex: 50_000, average_depreciation: 40_000 },
    })

    expect(items).toHaveLength(1)
    expect(items[0].ledgerCode).toBe('600')
    expect(items[0].category).toBe('salary')
    expect(items[0].status).toBe('pending')
    expect(items[0].confidence).toBe('high')
    expect(items[0].year).toBe(2023)
  })

  it('uses latest_fiscal_year for imported flags that omit their own year', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      latest_fiscal_year: 2024,
      reported_ebitda_by_year: { 2024: 260_000 },
      sde_flags: [
        {
          ledger_code: '610000',
          ledger_name: 'Services and other goods',
          amount: 206_000,
          suggested_question: 'Review discretionary spend?',
        },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'imported_sde_2024_610000_0',
      sourceRef: '2024:610000',
      year: 2024,
      applyYears: [2024],
      status: 'pending',
    })
  })

  it('returns empty array when no flags', () => {
    expect(buildNormalizationItemsFromImportedLedgerAnalysis({})).toEqual([])
    expect(buildNormalizationItemsFromImportedLedgerAnalysis({ sde_flags: [] })).toEqual([])
  })

  it('seeds the adjustment with the heuristic private-use share when supplied', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      sde_flags: [
        {
          ledger_code: '6110',
          ledger_name: 'Operationele leasing wagenpark',
          amount: 30_000,
          suggested_question: 'Private use of vehicle?',
          category: 'discretionary_expense',
          default_private_use_pct: 70,
          suggested_addback_amount: 21_000,
          year: 2024,
        },
      ],
    })

    expect(items).toHaveLength(1)
    // Raw amount preserved on `value`; pre-filled add-back goes to `adjustment`.
    expect(items[0].value).toBe(30_000)
    expect(items[0].adjustment).toBe(21_000)
    expect(items[0].reason).toContain('70%')
  })

  it('falls back to derived heuristic when only the share % is provided', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      sde_flags: [
        {
          ledger_code: '6140',
          ledger_name: 'Vervoerskosten',
          amount: 10_000,
          suggested_question: 'Private use of fuel/vehicle?',
          category: 'discretionary_expense',
          default_private_use_pct: 60,
          year: 2024,
        },
      ],
    })

    expect(items[0].adjustment).toBeCloseTo(6_000, 4)
    expect(items[0].reason).toContain('60%')
  })

  it('maps management-fee flags to related-party transactions', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      sde_flags: [
        {
          ledger_code: '6130',
          ledger_name: 'Managementvergoeding holding',
          amount: 80_000,
          suggested_question: 'Related-party management fee?',
          category: 'management_fees',
          year: 2024,
        },
      ],
    })

    expect(items[0].backendCategory).toBe('related_party_transactions')
  })

  it('drops 620000 personnel bucket flags from legacy snapshots', () => {
    const items = buildNormalizationItemsFromImportedLedgerAnalysis({
      sde_flags: [
        {
          ledger_code: '620000',
          ledger_name: 'Directors and managers',
          amount: 480_000,
          suggested_question: 'Review?',
          year: 2025,
        },
        {
          ledger_code: '610000',
          ledger_name: 'Services and other goods',
          amount: 200_000,
          suggested_addback_amount: 156_500,
          suggested_question: 'Review?',
          year: 2025,
        },
      ],
    })

    expect(items.map((item) => item.ledgerCode)).toEqual(['610000'])
    expect(items[0].adjustment).toBe(156_500)
  })
})

describe('normalizeImportedLedgerReviewStatuses', () => {
  it('demotes legacy accepted imported addbacks that still exceed the cap', () => {
    const [item] = buildNormalizationItemsFromImportedLedgerAnalysis({
      reported_ebitda_by_year: { 2024: 260_000 },
      sde_flags: [
        {
          ledger_code: '610000',
          ledger_name: 'Services and other goods',
          amount: 206_000,
          suggested_question: 'Review discretionary spend?',
          year: 2024,
        },
      ],
    })

    const [normalized] = normalizeImportedLedgerReviewStatuses([{ ...item, status: 'accepted' }], {
      2024: 260_000,
    })

    expect(normalized.status).toBe('pending')
  })

  it('keeps explicitly reviewed imported addbacks accepted', () => {
    const [item] = buildNormalizationItemsFromImportedLedgerAnalysis({
      reported_ebitda_by_year: { 2024: 260_000 },
      sde_flags: [
        {
          ledger_code: '610000',
          ledger_name: 'Services and other goods',
          amount: 206_000,
          suggested_question: 'Review discretionary spend?',
          year: 2024,
        },
      ],
    })

    const [normalized] = normalizeImportedLedgerReviewStatuses(
      [{ ...item, status: 'accepted', reviewedAt: '2026-06-01T10:00:00.000Z' }],
      { 2024: 260_000 }
    )

    expect(normalized.status).toBe('accepted')
  })
})
