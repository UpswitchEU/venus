import { describe, expect, it } from 'vitest'
import { buildNormalizationItemsFromImportedLedgerAnalysis } from './importedLedgerNormalization'

describe('buildNormalizationItemsFromImportedLedgerAnalysis', () => {
  it('maps SDE flags to pending normalization items', () => {
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
})
