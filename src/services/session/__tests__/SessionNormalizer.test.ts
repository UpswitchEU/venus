import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSessionData } from '../SessionNormalizer'

describe('normalizeSessionData', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fabricate historical years from current year data and keeps the year filing-safe', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_123',
      session_data: {
        company_name: 'Draft Co',
        current_year_data: {
          year: 2025,
          revenue: 1000000,
          ebitda: 100000,
        },
      },
    })

    expect(normalized.formData.current_year_data).toEqual({
      year: 2024,
      revenue: 1000000,
      ebitda: 100000,
    })
    expect(normalized.formData.historical_years_data).toBeUndefined()
    expect(normalized.formData.revenue).toBe(1000000)
    expect(normalized.formData.ebitda).toBe(100000)
  })

  it('clamps an unconfirmed future current year on restore during H1', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    const normalized = normalizeSessionData({
      session_key: 'val_h1',
      session_data: {
        current_year_data: {
          year: 2025,
          revenue: 1000000,
          ebitda: 100000,
        },
      },
    })

    expect(normalized.formData.current_year_data).toEqual({
      year: 2024,
      revenue: 1000000,
      ebitda: 100000,
    })
  })

  it('normalizes year_data into oldest-to-newest historical years', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_456',
      session_data: {
        year_data: {
          2024: { revenue: 950000, ebitda: 95000 },
          2022: { revenue: 750000, ebitda: 75000 },
          2023: { revenue: 850000, ebitda: 85000 },
        },
      },
    })

    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2022, revenue: 750000, ebitda: 75000 },
      { year: 2023, revenue: 850000, ebitda: 85000 },
      { year: 2024, revenue: 950000, ebitda: 95000 },
    ])
  })

  it('filters unconfirmed future historical rows from year_data during H1 restore', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    const normalized = normalizeSessionData({
      session_key: 'val_year_data_h1',
      session_data: {
        year_data: {
          2025: { revenue: 1050000, ebitda: 105000 },
          2024: { revenue: 950000, ebitda: 95000 },
          2023: { revenue: 850000, ebitda: 85000 },
        },
      },
    })

    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2023, revenue: 850000, ebitda: 85000 },
      { year: 2024, revenue: 950000, ebitda: 95000 },
    ])
  })

  it('merges activity_* with canonical NACE and prefers activity_label for description', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_act',
      session_data: {
        nace_code: '47.11',
        canonical_nace_code: '47.11',
        activity_code: '471100',
        activity_label: 'SBI beschrijving',
        taxonomy: 'SBI_2008',
        nace_description: 'Legacy NACE beschrijving',
      },
    })

    expect(normalized.formData.nace_code).toBe('47.11')
    expect(normalized.formData.canonical_nace_code).toBe('47.11')
    expect(normalized.formData.activity_code).toBe('471100')
    expect(normalized.formData.taxonomy).toBe('SBI_2008')
    expect(normalized.formData.nace_description).toBe('SBI beschrijving')
  })

  it('handles legacy session payloads with only nace_* fields', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_legacy',
      session_data: {
        nace_code: '56.101',
        nace_description: 'Restaurants',
      },
    })

    expect(normalized.formData.nace_code).toBe('56.101')
    expect(normalized.formData.nace_description).toBe('Restaurants')
  })

  it('prefers the richer persisted valuation result when top-level output is partial', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_789',
      valuationResult: {
        equity_value_low: 200000,
        equity_value_mid: 250000,
        equity_value_high: 300000,
      },
      session_data: {
        valuation_result: {
          equity_value_low: 200000,
          equity_value_mid: 250000,
          equity_value_high: 300000,
          details: {
            valuation_results: {
              ebitda_multiple: {
                available: true,
                value: 250000,
                label: 'EBITDA Multiple',
              },
            },
          },
        },
      },
    })

    expect((normalized.valuationResult as any)?.details?.valuation_results).toMatchObject({
      ebitda_multiple: {
        available: true,
        value: 250000,
      },
    })
  })

  it('normalizes legacy shares_for_sale values to 100', () => {
    const normalizedSnake = normalizeSessionData({
      session_key: 'val_shares_snake',
      session_data: {
        company_name: 'Legacy Snake',
        shares_for_sale: 40,
      },
    })

    const normalizedCamel = normalizeSessionData({
      session_key: 'val_shares_camel',
      session_data: {
        companyName: 'Legacy Camel',
        sharesForSale: 25,
      },
    })

    expect(normalizedSnake.formData.shares_for_sale).toBe(100)
    expect(normalizedCamel.formData.shares_for_sale).toBe(100)
  })

  it('restores filing year confirmation from snake_case and camelCase payloads', () => {
    const normalizedSnake = normalizeSessionData({
      session_key: 'val_filing_snake',
      session_data: {
        filing_year_confirmed: true,
      },
    })

    const normalizedCamel = normalizeSessionData({
      session_key: 'val_filing_camel',
      session_data: {
        filingYearConfirmed: true,
      },
    })

    expect((normalizedSnake.formData as any).filing_year_confirmed).toBe(true)
    expect((normalizedCamel.formData as any).filing_year_confirmed).toBe(true)
  })

  it('preserves _import_quality on the form payload for spotlight restoration', () => {
    const iq = {
      '2024': {
        confidence_score: 0.92,
        audit_flags: [],
        field_provenance: [],
        total_accounts_processed: 10,
        accounts_mapped_directly: 8,
        accounts_fallback: 1,
        accounts_skipped: 1,
      },
    }
    const normalized = normalizeSessionData({
      session_key: 'val_iq',
      session_data: {
        company_name: 'IQ Co',
        _import_quality: iq,
      },
    })

    expect((normalized.formData as any)._import_quality).toEqual(iq)
  })

  it('preserves business_context._imported_ledger_analysis for manual review UI', () => {
    const analysis = {
      latest_fiscal_year: 2024,
      sde_flags: [],
      ev_equity_bridge: { equity_value: 1, net_debt: 0 } as any,
      dcf_defaults: { suggested_capex: 50_000, average_depreciation: 40_000 },
    }
    const normalized = normalizeSessionData({
      session_key: 'val_ledger',
      session_data: {
        company_name: 'Ledger Co',
        business_context: {
          _imported_ledger_analysis: analysis,
        },
      },
    })

    expect((normalized.formData as any).business_context._imported_ledger_analysis).toEqual(analysis)
  })
})
