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
})
