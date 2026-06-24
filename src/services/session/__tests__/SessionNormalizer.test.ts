import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSessionData } from '../SessionNormalizer'

describe('normalizeSessionData', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fabricate historical years from current year data and keeps the year filing-safe', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))
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

  it('promotes the latest year_data row to current year and keeps older rows historical', () => {
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

    expect(normalized.formData.current_year_data).toEqual({
      year: 2024,
      revenue: 950000,
      ebitda: 95000,
    })
    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2022, revenue: 750000, ebitda: 75000 },
      { year: 2023, revenue: 850000, ebitda: 85000 },
    ])
    expect(normalized.formData.revenue).toBe(950000)
    expect(normalized.formData.ebitda).toBe(95000)
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

    expect(normalized.formData.current_year_data).toEqual({
      year: 2024,
      revenue: 950000,
      ebitda: 95000,
    })
    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2023, revenue: 850000, ebitda: 85000 },
    ])
  })

  it('prefers non-placeholder year_data rows over placeholder current/historical rows for the same basis year', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_upswitch_metaal_restore',
      session_data: {
        current_year_data: {
          year: 2024,
          revenue: 0,
          ebitda: 0,
        },
        historical_years_data: [
          { year: 2022, revenue: 780000, ebitda: 98000 },
          { year: 2023, revenue: 840000, ebitda: 112000 },
          { year: 2024, revenue: 0, ebitda: 0 },
        ],
        year_data: {
          2024: { revenue: 910000, ebitda: 120000 },
          2023: { revenue: 860000, ebitda: 110000 },
        },
      },
    })

    expect(normalized.formData.current_year_data).toEqual({
      year: 2024,
      revenue: 910000,
      ebitda: 120000,
    })
    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2022, revenue: 780000, ebitda: 98000 },
      { year: 2023, revenue: 840000, ebitda: 112000 },
    ])
    expect(normalized.formData.revenue).toBe(910000)
    expect(normalized.formData.ebitda).toBe(120000)
  })

  it('replaces a stale zero filing-year placeholder with the latest imported actual year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))

    const normalized = normalizeSessionData({
      session_key: 'val_yuki_latest_2024',
      session_data: {
        current_year_data: {
          year: 2025,
          revenue: 0,
          ebitda: 0,
        },
        historical_years_data: [
          { year: 2021, revenue: 1_350_000, ebitda: 180_000 },
          { year: 2022, revenue: 1_500_000, ebitda: 205_000 },
          { year: 2023, revenue: 1_650_000, ebitda: 230_000 },
          { year: 2024, revenue: 1_800_000, ebitda: 260_000 },
        ],
      },
    })

    expect(normalized.formData.current_year_data).toEqual({
      year: 2024,
      revenue: 1_800_000,
      ebitda: 260_000,
    })
    expect(normalized.formData.historical_years_data).toEqual([
      { year: 2021, revenue: 1_350_000, ebitda: 180_000 },
      { year: 2022, revenue: 1_500_000, ebitda: 205_000 },
      { year: 2023, revenue: 1_650_000, ebitda: 230_000 },
    ])
    expect(normalized.formData.revenue).toBe(1_800_000)
    expect(normalized.formData.ebitda).toBe(260_000)
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

  it('repairs zero pricing midpoint from positive valuation bounds during restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_zero_mid_positive_range',
      session_data: {
        valuation_result: {
          equity_value_low: 12_800_000,
          equity_value_mid: 0,
          equity_value_high: 18_400_000,
          recommended_asking_price: 0,
        },
      },
    })

    expect(normalized.pricingRange).toEqual({
      min: 12_800_000,
      mid: 15_600_000,
      max: 18_400_000,
      currency: 'EUR',
    })
  })

  it('marks completed sessions without output assets as not report-ready', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_pending',
      status: 'completed',
      session_data: {
        company_name: 'Pending Co',
      },
    })

    expect(normalized.reportReady).toBe(false)
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

  it('preserves _import_quality on the form payload for session restoration', () => {
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

    expect((normalized.formData as any).business_context._imported_ledger_analysis).toEqual(
      analysis
    )
  })

  it('preserves top-level imported integration artifacts for restore aliases', () => {
    const analysis = {
      latest_fiscal_year: 2024,
      sde_flags: [],
    }
    const normalized = normalizeSessionData({
      session_key: 'val_ledger_top_level',
      session_data: {
        _imported_ledger_analysis: analysis,
        _imported_saas_metrics: { saas_arr: 1230000 },
        _imported_saas_provenance: { provider: 'yuki' },
      },
    })

    expect((normalized.formData as any)._imported_ledger_analysis).toEqual(analysis)
    expect((normalized.formData as any)._imported_saas_metrics).toEqual({ saas_arr: 1230000 })
    expect((normalized.formData as any)._imported_saas_provenance).toEqual({ provider: 'yuki' })
  })

  describe('preSelectedValuationMethod (_pre_selected_valuation_method)', () => {
    it('is undefined when the session key is absent', () => {
      const normalized = normalizeSessionData({
        session_key: 'val_nopre',
        session_data: { company_name: 'No Pre Co' },
      })
      expect(normalized.preSelectedValuationMethod).toBeUndefined()
    })

    it('is null when the key is explicitly JSON null (AI adaptive)', () => {
      const normalized = normalizeSessionData({
        session_key: 'val_nullpre',
        session_data: {
          company_name: 'Null Pre Co',
          _pre_selected_valuation_method: null,
        },
      })
      expect(normalized.preSelectedValuationMethod).toBeNull()
    })

    it('lower-cases a stored method key', () => {
      const normalized = normalizeSessionData({
        session_key: 'val_dcf',
        session_data: {
          _pre_selected_valuation_method: 'DCF',
        },
      })
      expect(normalized.preSelectedValuationMethod).toBe('dcf')
    })

    it('reads the snake_case alias pre_selected_valuation_method', () => {
      const normalized = normalizeSessionData({
        session_key: 'val_alias',
        session_data: {
          pre_selected_valuation_method: 'adjusted_nav',
        },
      })
      expect(normalized.preSelectedValuationMethod).toBe('adjusted_nav')
    })
  })

  it('extracts NAV and real-estate carve-out fields into formData', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_nav',
      session_data: {
        nav_hidden_reserves: 50000,
        nav_tax_latency_pct: 30,
        exclude_real_estate: true,
        real_estate_book_value: 200000,
        estimated_market_rent: 12000,
      },
    })
    expect(normalized.formData.nav_hidden_reserves).toBe(50000)
    expect(normalized.formData.nav_tax_latency_pct).toBe(30)
    expect(normalized.formData.exclude_real_estate).toBe(true)
    expect(normalized.formData.real_estate_book_value).toBe(200000)
    expect(normalized.formData.estimated_market_rent).toBe(12000)
  })

  it('reads camelCase NAV / carve-out aliases', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_nav_camel',
      session_data: {
        navHiddenReserves: 1,
        excludeRealEstate: false,
      },
    })
    expect(normalized.formData.nav_hidden_reserves).toBe(1)
    expect(normalized.formData.exclude_real_estate).toBe(false)
  })

  it('extracts owner_salary_addback for SDE restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_sde',
      session_data: { owner_salary_addback: 72_000 },
    })
    expect(normalized.formData.owner_salary_addback).toBe(72_000)
  })

  it('extracts DCF mode and assumption scalars for manual restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_dcf_restore',
      session_data: {
        dcf_input_mode: 'fcff_only',
        dcf_wacc_pct: 9.25,
        dcf_terminal_growth_pct: 2.5,
        dcf_revenue_growth_pct: 8,
        dcf_discounting_convention: 'year_end',
        dcf_tax_shield_projections: [1.5, 1.125, 0.75],
        dcf_terminal_value_method: 'perpetuity_growth',
      },
    })
    expect(normalized.formData.dcf_input_mode).toBe('fcff_only')
    expect(normalized.formData.dcf_wacc_pct).toBe(9.25)
    expect(normalized.formData.dcf_terminal_growth_pct).toBe(2.5)
    expect(normalized.formData.dcf_revenue_growth_pct).toBe(8)
    expect(normalized.formData.dcf_discounting_convention).toBe('year_end')
    expect(normalized.formData.dcf_tax_shield_projections).toEqual([1.5, 1.125, 0.75])
    expect(normalized.formData.dcf_terminal_value_method).toBe('perpetual_growth')
  })

  it('normalizes localized DCF session assumptions before manual restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_dcf_localized_restore',
      session_data: {
        dcf_input_mode: 'unexpected',
        dcf_wacc_pct: '11,0',
        dcf_terminal_growth_pct: '2,25',
        dcf_revenue_growth_pct: '8,5',
        dcf_ebitda_margin_pct: '20,5',
        dcf_capex_pct: '4,0',
        dcf_da_pct: '3,0',
        dcf_nwc_pct: '1,5',
        dcf_tax_rate_pct: '25,0',
        dcf_risk_free_rate_pct: '3,0',
        dcf_equity_risk_premium_pct: '5,5',
        dcf_beta: '1,1',
        dcf_cost_of_debt_pct: '4,5',
        dcf_debt_equity_pct: '30',
        dcf_tax_shield_pct: '25',
        dcf_discounting_convention: 'unexpected',
        dcf_tax_shield_projections: ['1.500', '1.125', null, 'bad'],
        dcf_terminal_value_method: 'gordon_growth',
      },
    })

    expect(normalized.formData).toMatchObject({
      dcf_input_mode: 'ebitda',
      dcf_wacc_pct: 11,
      dcf_terminal_growth_pct: 2.25,
      dcf_revenue_growth_pct: 8.5,
      dcf_ebitda_margin_pct: 20.5,
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 1.5,
      dcf_tax_rate_pct: 25,
      dcf_risk_free_rate_pct: 3,
      dcf_equity_risk_premium_pct: 5.5,
      dcf_beta: 1.1,
      dcf_cost_of_debt_pct: 4.5,
      dcf_debt_equity_pct: 30,
      dcf_tax_shield_pct: 25,
      dcf_discounting_convention: 'mid_year',
      dcf_tax_shield_projections: [1500, 1125],
      dcf_terminal_value_method: 'perpetual_growth',
    })
  })

  it('extracts user_configured_dcf from session (snake or camel alias)', () => {
    const snake = normalizeSessionData({
      session_key: 'val_ucd_snake',
      session_data: { user_configured_dcf: true },
    })
    expect(snake.formData.user_configured_dcf).toBe(true)
    const camel = normalizeSessionData({
      session_key: 'val_ucd_camel',
      session_data: { userConfiguredDcf: true },
    })
    expect(camel.formData.user_configured_dcf).toBe(true)
  })

  it('extracts business-type adaptive metadata for restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_internal_meta',
      session_data: {
        _internal_key_metrics: ['ebitda'],
        _internal_typical_employee_range: { min: 5, max: 50 },
        _internal_typical_revenue_range: { min: 1e6, max: 5e6 },
      },
    })
    expect(normalized.formData._internal_key_metrics).toEqual(['ebitda'])
    expect(normalized.formData._internal_typical_employee_range).toEqual({ min: 5, max: 50 })
    expect(normalized.formData._internal_typical_revenue_range).toEqual({ min: 1e6, max: 5e6 })
  })

  it('extracts SaaS, revenue-quality, subIndustry, and legacy tax_latencies for adaptive restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_adaptive_restore',
      session_data: {
        subIndustry: 'SaaS vertical',
        saas_arr: 1_200_000,
        saas_nrr_pct: 110,
        rev_recurring_amount: 400_000,
        rev_top_client_concentration_pct: 22,
        tax_latencies: [
          { type: 'passive', description: 'x', temporary_difference: 1, tax_rate: 25 },
        ],
      },
    })
    expect(normalized.formData.subIndustry).toBe('SaaS vertical')
    expect(normalized.formData.saas_arr).toBe(1_200_000)
    expect(normalized.formData.saas_nrr_pct).toBe(110)
    expect(normalized.formData.rev_recurring_amount).toBe(400_000)
    expect(normalized.formData.rev_top_client_concentration_pct).toBe(22)
    expect(Array.isArray(normalized.formData.tax_latencies)).toBe(true)
    expect((normalized.formData.tax_latencies as unknown[]).length).toBe(1)
  })

  it('extracts deal/capital/NAV method fields and official filing overlays for restore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_method_matrix_restore',
      session_data: {
        deal_type: 'asset_purchase',
        deal_registration_duty_pct: 12.5,
        deal_seller_is_individual: true,
        capital_history_enabled: true,
        capital_round_amount: 2500000,
        capital_last_round_post_money: 15000000,
        capital_safe_notes: [{ amount: 400000, discount_pct: 20 }],
        nav_real_estate_book_value: 800000,
        nav_real_estate_appraisal_value: 1250000,
        nav_per_asset_tax_rates: { real_estate: 30, equipment: 25 },
        nav_equipment_revaluation: { book_value: 120000, market_value: 160000 },
        official_financials: {
          years: [{ year: 2024, revenue: 1200000, ebitda: 180000 }],
        },
        official_variance_analysis: { revenue_delta_pct: 3.1 },
        official_verification_badge: { level: 'verified', source: 'nbb' },
      },
    })

    expect(normalized.formData.deal_type).toBe('asset_purchase')
    expect(normalized.formData.deal_registration_duty_pct).toBe(12.5)
    expect(normalized.formData.deal_seller_is_individual).toBe(true)
    expect(normalized.formData.capital_history_enabled).toBe(true)
    expect(normalized.formData.capital_round_amount).toBe(2500000)
    expect(normalized.formData.capital_last_round_post_money).toBe(15000000)
    expect(normalized.formData.capital_safe_notes).toEqual([{ amount: 400000, discount_pct: 20 }])
    expect(normalized.formData.nav_real_estate_book_value).toBe(800000)
    expect(normalized.formData.nav_real_estate_appraisal_value).toBe(1250000)
    expect(normalized.formData.nav_per_asset_tax_rates).toEqual({ real_estate: 30, equipment: 25 })
    expect(normalized.formData.nav_equipment_revaluation).toEqual({
      book_value: 120000,
      market_value: 160000,
    })
    expect((normalized.formData as any).official_financials).toEqual({
      years: [{ year: 2024, revenue: 1200000, ebitda: 180000 }],
    })
    expect((normalized.formData as any).official_variance_analysis).toEqual({
      revenue_delta_pct: 3.1,
    })
    expect((normalized.formData as any).official_verification_badge).toEqual({
      level: 'verified',
      source: 'nbb',
    })
  })

  it('promotes adaptive scalars from business_context when top-level keys are missing', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_bc_promote',
      session_data: {
        business_context: {
          saas_arr: 1_200_000,
          saas_nrr_pct: 115,
          dcf_wacc_pct: 9.5,
          nav_hidden_reserves: 40_000,
          rev_recurring_amount: 300_000,
        },
      },
    })
    expect(normalized.formData.saas_arr).toBe(1_200_000)
    expect(normalized.formData.saas_nrr_pct).toBe(115)
    expect(normalized.formData.dcf_wacc_pct).toBe(9.5)
    expect(normalized.formData.nav_hidden_reserves).toBe(40_000)
    expect(normalized.formData.rev_recurring_amount).toBe(300_000)
  })

  it('promotes adaptive struct fields from business_context when top-level slots are empty', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_bc_struct_promote',
      session_data: {
        capital_safe_notes: [],
        nav_per_asset_tax_rates: {},
        business_context: {
          capital_safe_notes: [{ amount: 150000, discount_pct: 15 }],
          nav_per_asset_tax_rates: { real_estate: 30 },
        },
      },
    })

    expect(normalized.formData.capital_safe_notes).toEqual([{ amount: 150000, discount_pct: 15 }])
    expect(normalized.formData.nav_per_asset_tax_rates).toEqual({ real_estate: 30 })
  })

  it('promotes API camelCase adaptive metadata from business_context onto _internal_*', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_bc_camel',
      session_data: {
        business_context: {
          keyMetrics: ['ebitda', 'revenue'],
          typicalEmployeeRange: { min: 2, max: 20 },
          dcfPreference: 0.6,
        },
      },
    })
    expect(normalized.formData._internal_key_metrics).toEqual(['ebitda', 'revenue'])
    expect(normalized.formData._internal_typical_employee_range).toEqual({ min: 2, max: 20 })
    expect(normalized.formData._internal_dcf_preference).toBe(0.6)
  })

  it('does not override top-level adaptive fields with business_context', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_bc_no_override',
      session_data: {
        saas_arr: 500_000,
        business_context: { saas_arr: 9_999_999, dcf_wacc_pct: 12 },
      },
    })
    expect(normalized.formData.saas_arr).toBe(500_000)
    expect(normalized.formData.dcf_wacc_pct).toBe(12)
  })

  it('preserves pending-invitation client context when client_user_id is null', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_ctx_pending_invite',
      session_data: {
        _client_context: {
          client_user_id: null,
          accountant_user_id: 'acct-1',
          relationship_id: 'rel-1',
        },
      },
    })
    expect(normalized.clientContext).toEqual({
      accountantUserId: 'acct-1',
      clientUserId: null,
      relationshipId: 'rel-1',
    })
  })

  it('maps engine-flat selected_method when legacy _pre_selected_valuation_method is absent', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_sel_flat',
      session_data: {
        selected_method: 'DCF',
      },
    })
    expect(normalized.preSelectedValuationMethod).toBe('dcf')
  })

  it('prefers _pre_selected_valuation_method over selected_method when both exist', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_sel_both',
      session_data: {
        _pre_selected_valuation_method: 'ebitda_multiple',
        selected_method: 'dcf',
      },
    })
    expect(normalized.preSelectedValuationMethod).toBe('ebitda_multiple')
  })

  it('accepts pre_selected_valuation_methods and user_weights without leading underscore', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_blend_flat',
      session_data: {
        pre_selected_valuation_methods: ['dcf', 'adjusted_nav'],
        user_weights: { dcf: 60, adjusted_nav: 40 },
        user_weight_justification: 'Client asked for floor + income.',
      },
    })
    expect(normalized.preSelectedMethods).toEqual(['dcf', 'adjusted_nav'])
    expect(normalized.userWeights).toEqual({ dcf: 60, adjusted_nav: 40 })
    expect(normalized.userWeightJustification).toBe('Client asked for floor + income.')
  })

  it('maps userWeights camelCase when underscore keys are absent', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_uw_camel',
      session_data: {
        userWeights: { dcf: 50, ebitda_multiple: 50 },
      },
    })
    expect(normalized.userWeights).toEqual({ dcf: 50, ebitda_multiple: 50 })
  })

  it('merges session_data when sessionData is an empty object', () => {
    const normalized = normalizeSessionData({
      session_key: 'val_merge_env',
      sessionData: {},
      session_data: {
        company_name: 'Merged Co',
      },
    })
    expect(normalized.formData.company_name).toBe('Merged Co')
  })

  it('prefers val_* from nested session_data over stale UUID reportId', () => {
    const normalized = normalizeSessionData({
      reportId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
      session_data: { session_key: 'val_nested_routing' },
    })
    expect(normalized.reportId).toBe('val_nested_routing')
  })
})
