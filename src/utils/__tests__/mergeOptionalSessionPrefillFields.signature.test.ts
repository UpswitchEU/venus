import { describe, expect, it } from 'vitest'

import {
  getSessionOptionalPrefillSignature,
  stableOptionalPrefillSourceSignature,
} from '../mergeOptionalSessionPrefillFields'

describe('stableOptionalPrefillSourceSignature', () => {
  it('ignores unrelated underscore keys for envelope hashing (optional content unchanged)', () => {
    const withNoise = {
      company_name: 'X',
      dcf_wacc_pct: 9.5,
      nav_hidden_reserves: 1,
      _foo: 1,
    } as Record<string, unknown>
    const base = { company_name: 'X', dcf_wacc_pct: 9.5, nav_hidden_reserves: 1 } as Record<
      string,
      unknown
    >
    expect(stableOptionalPrefillSourceSignature(withNoise)).toBe(
      stableOptionalPrefillSourceSignature(base)
    )
  })

  it('changes when company identity changes (chunked session delivery)', () => {
    const a = stableOptionalPrefillSourceSignature({
      company_name: 'X',
      dcf_wacc_pct: 9.5,
      nav_hidden_reserves: 1,
    } as Record<string, unknown>)
    const b = stableOptionalPrefillSourceSignature({
      company_name: 'Y',
      dcf_wacc_pct: 9.5,
      nav_hidden_reserves: 1,
    } as Record<string, unknown>)
    expect(a).not.toBe(b)
  })

  it('bumps when valuation-relevant session envelope grows (historical_years_data appears)', () => {
    const identityOnly = stableOptionalPrefillSourceSignature({
      company_name: 'Acme',
      kbo_number: '0123456789',
    } as Record<string, unknown>)
    const withHy = stableOptionalPrefillSourceSignature({
      company_name: 'Acme',
      kbo_number: '0123456789',
      historical_years_data: [{ year: 2023, revenue: 1, ebitda: 1 }],
    } as Record<string, unknown>)
    expect(identityOnly).not.toBe(withHy)
    expect(withHy).toContain('sd_env:')
  })

  it('changes when _internal_key_metrics changes', () => {
    const a = { _internal_key_metrics: ['ebitda'] }
    const b = { _internal_key_metrics: ['ebitda', 'revenue'] }
    expect(stableOptionalPrefillSourceSignature(a)).not.toBe(
      stableOptionalPrefillSourceSignature(b)
    )
  })

  it('includes year_data financial fingerprint (not only key count)', () => {
    const s1 = stableOptionalPrefillSourceSignature({
      year_data: { '2023': { revenue: 1, ebitda: 1 }, '2022': { revenue: 2, ebitda: 2 } },
    })
    const s2 = stableOptionalPrefillSourceSignature({
      year_data: { '2023': { revenue: 99, ebitda: 1 }, '2022': { revenue: 2, ebitda: 2 } },
    })
    expect(s1).toContain('year_data:')
    expect(s1).not.toBe(s2)
  })

  it('changes when historical row values change at same length', () => {
    const a = stableOptionalPrefillSourceSignature({
      historical_years_data: [{ year: 2022, revenue: 100, ebitda: 10 }],
    })
    const b = stableOptionalPrefillSourceSignature({
      historical_years_data: [{ year: 2022, revenue: 200, ebitda: 10 }],
    })
    expect(a).not.toBe(b)
  })

  it('getSessionOptionalPrefillSignature merges _businessInfo into the signed surface', () => {
    const sig = getSessionOptionalPrefillSignature({
      _businessInfo: { dcf_wacc_pct: 8 },
      revenue: 1,
    })
    expect(sig).toContain('dcf_wacc_pct:8')
    expect(sig).toContain('revenue:1')
  })

  it('normalizes filing_year_confirmed in fingerprint (boolean vs string "1")', () => {
    expect(
      stableOptionalPrefillSourceSignature({ filing_year_confirmed: true } as Record<
        string,
        unknown
      >)
    ).toBe(
      stableOptionalPrefillSourceSignature({ filing_year_confirmed: '1' } as Record<
        string,
        unknown
      >)
    )
  })

  it('changes when import_quality confidence changes (alias keys)', () => {
    const low = stableOptionalPrefillSourceSignature({
      _import_quality: { '2023': { confidence_score: 0.2 } },
    } as Record<string, unknown>)
    const high = stableOptionalPrefillSourceSignature({
      import_quality: { '2023': { confidence_score: 0.9 } },
    } as Record<string, unknown>)
    expect(low).toContain('import_quality:')
    expect(low).not.toBe(high)
  })

  it('includes _financial_data_source in fingerprint', () => {
    expect(
      stableOptionalPrefillSourceSignature({ _financial_data_source: 'yuki' } as Record<
        string,
        unknown
      >)
    ).toContain('_financial_data_source:yuki')
  })

  it('changes when official_financials headline figures change', () => {
    const a = stableOptionalPrefillSourceSignature({
      official_financials: { filingYear: 2023, revenue: 100, ebitda: 10 },
    } as Record<string, unknown>)
    const b = stableOptionalPrefillSourceSignature({
      official_financials: { filing_year: 2023, revenue: 200, ebitda: 10 },
    } as Record<string, unknown>)
    expect(a).not.toBe(b)
  })

  it('changes when comparables set changes', () => {
    const one = stableOptionalPrefillSourceSignature({
      comparables: [{ id: 'a' }],
    } as Record<string, unknown>)
    const two = stableOptionalPrefillSourceSignature({
      comparables: [{ id: 'a' }, { id: 'b' }],
    } as Record<string, unknown>)
    expect(one).not.toBe(two)
  })

  it('changes when business_context SaaS provenance or ledger analysis shape changes', () => {
    const saas = stableOptionalPrefillSourceSignature({
      business_context: {
        _imported_saas_metrics: { arr: 1 },
        _imported_saas_provenance: { provider: 'stripe' },
      },
    } as Record<string, unknown>)
    const ledger = stableOptionalPrefillSourceSignature({
      business_context: {
        _imported_ledger_analysis: { sde_flags: [{}], tax_latency_candidates: [] },
      },
    } as Record<string, unknown>)
    expect(saas).toContain('business_context_meta')
    expect(ledger).toContain('business_context_meta')
    expect(saas).not.toBe(ledger)
  })

  it('includes persisted blend keys _user_weights and _pre_selected_valuation_methods', () => {
    const w = stableOptionalPrefillSourceSignature({
      _user_weights: { dcf: 0.5 },
    } as Record<string, unknown>)
    expect(w).toContain('user_weights_sig:')
    const m = stableOptionalPrefillSourceSignature({
      _pre_selected_valuation_methods: ['dcf', 'adjusted_nav'],
    } as Record<string, unknown>)
    expect(m).toContain('pre_selected_valuation_methods:adjusted_nav,dcf')
  })
})
