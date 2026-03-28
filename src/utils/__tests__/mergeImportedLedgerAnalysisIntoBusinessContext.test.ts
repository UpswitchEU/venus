import { describe, expect, it } from 'vitest'

import { mergeImportedLedgerAnalysisIntoBusinessContext } from '../mergeImportedLedgerAnalysisIntoBusinessContext'

describe('mergeImportedLedgerAnalysisIntoBusinessContext', () => {
  it('creates business_context with analysis and provenance from batch only', () => {
    const out = mergeImportedLedgerAnalysisIntoBusinessContext(
      undefined,
      {
        latest_fiscal_year: 2024,
        dcf_defaults: { suggested_capex: 12000, average_depreciation: 8000 },
        sde_flags: [{ ledger_code: 'x', ledger_name: 'y', amount: 1, suggested_question: 'q', potential_sde_addback: true }],
        ev_equity_bridge: { enterprise_value: 1, cash_and_equivalents: 0, long_term_debt: 0, short_term_financial_debt: 0, interest_bearing_debt: 0, net_debt: 0, equity_value: 1 },
      },
      'bizzcontrol'
    )
    expect(out.saas_arr).toBeUndefined()
    expect((out._imported_ledger_analysis as { dcf_defaults?: { suggested_capex?: number } }).dcf_defaults?.suggested_capex).toBe(12000)
    expect((out._imported_ledger_provenance as { provider: string }).provider).toBe('bizzcontrol')
  })

  it('preserves unrelated business_context keys', () => {
    const out = mergeImportedLedgerAnalysisIntoBusinessContext(
      { sector_tag: 'retail', other: 1 },
      { dcf_defaults: { suggested_capex: 5000, average_depreciation: 2000 } },
      'octopus'
    )
    expect(out.sector_tag).toBe('retail')
    expect(out.other).toBe(1)
  })

  it('merges dcf_defaults over existing analysis without dropping sde_flags', () => {
    const out = mergeImportedLedgerAnalysisIntoBusinessContext(
      {
        _imported_ledger_analysis: {
          sde_flags: [{ ledger_code: 'a', ledger_name: 'b', amount: 2, suggested_question: 's', potential_sde_addback: false }],
          dcf_defaults: { suggested_capex: 100, average_depreciation: 50 },
        },
      },
      { dcf_defaults: { suggested_capex: 200 } },
      'silverfin'
    )
    const a = out._imported_ledger_analysis as { dcf_defaults?: { suggested_capex?: number; average_depreciation?: number }; sde_flags?: unknown[] }
    expect(a.dcf_defaults?.suggested_capex).toBe(200)
    expect(a.dcf_defaults?.average_depreciation).toBe(50)
    expect(a.sde_flags?.length).toBe(1)
  })
})
