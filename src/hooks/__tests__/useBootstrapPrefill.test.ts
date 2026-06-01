import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREFILL_SOURCE_ACCOUNTING_INTEGRATION } from '../../lib/bootstrap/types'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useImportQualityStore } from '../../store/useImportQualityStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import { resetBootstrapPrefillState, useBootstrapPrefill } from '../useBootstrapPrefill'

const { mockUseBootstrapSafe } = vi.hoisted(() => ({
  mockUseBootstrapSafe: vi.fn(),
}))

vi.mock('../../lib/bootstrap', () => ({
  useBootstrapSafe: mockUseBootstrapSafe,
}))

describe('useBootstrapPrefill', () => {
  beforeEach(() => {
    resetBootstrapPrefillState()
    useManualFormStore.getState().resetForm()
    useNormalizationStore.getState().clear()
    useImportQualityStore.setState({
      importQuality: null,
      provider: null,
    })
    useTaxLatencyStore.getState().clear()
    useSessionStore.setState({ session: null })
    mockUseBootstrapSafe.mockReset()

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates NL client country into the manual form store', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_nl_prefill', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        companyInfo: {
          companyName: 'Dutch Client BV',
          countryCode: 'NL',
          city: 'Amsterdam',
        },
        businessType: {
          id: 'software',
          title: 'Software',
          industry: 'technology',
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'country_code'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    const { result } = renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      expect(result.current.hasPrefilled).toBe(true)
      expect(useManualFormStore.getState().formData.country_code).toBe('NL')
      expect(useManualFormStore.getState().formData.company_name).toBe('Dutch Client BV')
    })
  })

  it('leaves country empty when no explicit client country exists', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_be_fallback', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        companyInfo: {
          companyName: 'Fallback Client',
        },
        businessType: {
          id: 'services',
          title: 'Services',
          industry: 'services',
        },
        confidence: 0.4,
        fieldsPopulated: ['company_name'],
        fieldsRemaining: ['country_code'],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.country_code).toBe('')
      expect(useManualFormStore.getState().formData.company_name).toBe('Fallback Client')
    })
  })

  it('persists official Belgian filing trust context into the manual form store', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_be_official', hasExistingData: false },
      prefillData: {
        sources: ['official_belgian_filing'],
        companyInfo: {
          companyName: 'Verified Belgian BV',
          countryCode: 'BE',
        },
        officialFinancials: {
          source: 'staatsbladmonitor',
          sourceLabel: 'NBB filing via Staatsbladmonitor',
          filingYear: 2024,
          revenue: 880000,
          ebitda: 95000,
          varianceAnalysis: {
            state: 'pending',
            explanationRequired: true,
          },
          verificationBadge: {
            state: 'verified',
            label: 'Verified by NBB',
          },
        },
        confidence: 0.8,
        fieldsPopulated: ['company_name', 'official_financials'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      const formData = useManualFormStore.getState().formData as any
      expect(formData.official_financials).toMatchObject({
        source: 'staatsbladmonitor',
        filingYear: 2024,
        revenue: 880000,
        ebitda: 95000,
      })
      expect(formData.official_variance_analysis).toEqual({
        state: 'pending',
        explanationRequired: true,
      })
      expect(formData.official_verification_badge).toEqual({
        state: 'verified',
        label: 'Verified by NBB',
      })
    })
  })

  it('hydrates imported SaaS metrics and provenance into the manual form store', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_saas_import', hasExistingData: false },
      prefillData: {
        sources: [PREFILL_SOURCE_ACCOUNTING_INTEGRATION],
        companyInfo: {
          companyName: 'Recurring Co',
          countryCode: 'BE',
        },
        financials: {
          revenue: 900000,
          ebitda: 180000,
          saasMetrics: {
            saas_arr: 720000,
            saas_mrr: 60000,
            saas_gross_margin_pct: 78,
          },
          saasMetricsProvenance: {
            source: 'yuki',
            confidence: 0.8,
            fiscal_year: 2024,
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'revenue'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      const formData = useManualFormStore.getState().formData as any
      expect(formData.saas_arr).toBe(720000)
      expect(formData.saas_mrr).toBe(60000)
      expect(formData.saas_gross_margin_pct).toBe(78)
      expect(formData.business_context._imported_saas_metrics).toEqual({
        saas_arr: 720000,
        saas_mrr: 60000,
        saas_gross_margin_pct: 78,
      })
      expect(formData.business_context._imported_saas_provenance).toEqual({
        source: 'yuki',
        confidence: 0.8,
        fiscal_year: 2024,
      })
    })
  })

  it('hydrates imported tax latency candidates into the tax latency store', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_tax_latency_import', hasExistingData: false },
      prefillData: {
        sources: [PREFILL_SOURCE_ACCOUNTING_INTEGRATION],
        companyInfo: {
          companyName: 'Property Co',
          countryCode: 'BE',
        },
        financials: {
          revenue: 900000,
          ebitda: 180000,
          importedLedgerAnalysis: {
            tax_latency_candidates: [
              {
                account_code: '222000',
                account_name: 'Gebouwen',
                description: 'Vastgoed op de balans',
                suggested_question:
                  'Opgelet: MAR 222000 bevat vastgoed. Wilt u hier een belastinglatentie op toepassen?',
                tax_rate: 25,
                fiscal_year: 2024,
              },
            ],
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'revenue'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      expect(useTaxLatencyStore.getState().candidates).toEqual([
        expect.objectContaining({
          accountCode: '222000',
          accountName: 'Gebouwen',
          year: 2024,
        }),
      ])
    })
  })

  it('hydrates Mercury-synced Exact prefill into the manual, normalization, and import quality stores', async () => {
    const importedLedgerAnalysis = {
      latest_fiscal_year: 2024,
      sde_flags: [
        {
          ledger_code: '610000',
          ledger_name: 'Related party rent',
          amount: 200_000,
          suggested_addback_amount: 156_000,
          deviation_pct: 0.18,
          benchmark_median_pct: 0.04,
          benchmark_std_pct: 0.03,
          actual_pct_of_revenue: 0.08,
          z_score: 2.1,
          confidence: 0.81,
          year: 2024,
          potential_sde_addback: true,
          suggested_question: "Is this rent at arm's length?",
          rationale: 'Rent appears elevated versus peers.',
          category: 'related_party_rent',
        },
      ],
      ev_equity_bridge: {
        enterprise_value: 900_000,
        cash_and_equivalents: 120_000,
        long_term_debt: 80_000,
        short_term_financial_debt: 20_000,
        interest_bearing_debt: 100_000,
        net_debt: -20_000,
        equity_value: 920_000,
      },
      dcf_defaults: {
        average_depreciation: 40_000,
        suggested_capex: 45_000,
      },
    }

    const importQuality = {
      '2024': {
        confidence_score: 0.92,
        audit_flags: [
          {
            field: 'ebitda',
            code: 'manual_review',
            severity: 'warning' as const,
            message: 'Verify EBITDA classification',
            source_accounts: ['610000'],
            fiscal_year: 2024,
          },
        ],
        field_provenance: [
          {
            field: 'ebitda',
            value: 250_000,
            source_accounts: ['610000'],
            mapping_method: 'direct' as const,
          },
        ],
        total_accounts_processed: 10,
        accounts_mapped_directly: 8,
        accounts_fallback: 1,
        accounts_skipped: 1,
      },
    }

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_exact_mercury_prefill', hasExistingData: false },
      prefillData: {
        sources: [PREFILL_SOURCE_ACCOUNTING_INTEGRATION],
        companyInfo: {
          companyName: 'Exact Sync BV',
          countryCode: 'BE',
        },
        financials: {
          revenue: 1_500_000,
          ebitda: 250_000,
          employeeCount: 12,
          importQuality,
          importedLedgerAnalysis,
        },
        confidence: 0.95,
        fieldsPopulated: ['company_name', 'country_code', 'revenue', 'ebitda'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
      ui: {
        sourceApp: 'mercury',
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      const formData = useManualFormStore.getState().formData as any
      expect(formData.company_name).toBe('Exact Sync BV')
      expect(formData.country_code).toBe('BE')
      expect(formData.revenue).toBe(1_500_000)
      expect(formData.ebitda).toBe(250_000)
      expect(formData.business_context._imported_ledger_analysis).toEqual(importedLedgerAnalysis)

      expect(useNormalizationStore.getState().items).toEqual([
        expect.objectContaining({
          ledgerCode: '610000',
          ledgerName: 'Related party rent',
          adjustment: 156_000,
          // Extreme imported addbacks must be reviewed before they alter EBITDA.
          status: 'pending',
          year: 2024,
        }),
      ])

      expect(useImportQualityStore.getState().importQuality).toEqual(importQuality)
    })
  })

  it('filters unconfirmed future yearData rows during H1 bootstrap prefill', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_h1_year_data', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        companyInfo: {
          companyName: 'History Co',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            2025: { revenue: 1_050_000, ebitda: 105_000 },
            2024: { revenue: 950_000, ebitda: 95_000 },
            2023: { revenue: 850_000, ebitda: 85_000 },
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'current_year_data'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const formData = useManualFormStore.getState().formData as any
    expect(formData.current_year_data).toMatchObject({
      year: 2024,
      revenue: 950000,
      ebitda: 95000,
    })
    expect(formData.historical_years_data).toEqual([{ year: 2023, revenue: 850000, ebitda: 85000 }])
  })

  it('drops prefill current-year data entirely when only future yearData rows exist in H1', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_h1_future_only', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        companyInfo: {
          companyName: 'Future Only Co',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            2025: { revenue: 1_050_000, ebitda: 105_000 },
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'current_year_data'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const formData = useManualFormStore.getState().formData as any
    expect(formData.current_year_data).toMatchObject({
      year: 2024,
      revenue: 0,
      ebitda: 0,
    })
    expect(formData.historical_years_data).toBeUndefined()
  })

  it('preserves yearData rows where revenue or EBITDA is legitimate zero', async () => {
    // Regression: previously `(data?.revenue || data?.ebitda)` dropped any
    // row where both metrics were 0/undefined. After the fix we keep a row
    // whenever at least one metric is a finite number — including zero —
    // so break-even years and CBSO-filled placeholder rows survive into
    // the wizard.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_zero_year', hasExistingData: false },
      prefillData: {
        sources: ['session', 'nbb_cbso_multi_year'],
        companyInfo: {
          companyName: 'Break Even BV',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            // 2024: real data
            2024: { revenue: 500_000, ebitda: 60_000 },
            // 2023: legitimate break-even year (zero ebitda but real revenue)
            2023: { revenue: 480_000, ebitda: 0 },
            // 2022: revenue=0 but ebitda is real (e.g., partial year)
            2022: { revenue: 0, ebitda: 5_000 },
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'current_year_data'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const formData = useManualFormStore.getState().formData as any
    expect(formData.current_year_data).toMatchObject({
      year: 2024,
      revenue: 500_000,
      ebitda: 60_000,
    })
    // Both prior years must round-trip — including 2022 with revenue=0.
    expect(formData.historical_years_data).toEqual([
      { year: 2023, revenue: 480_000, ebitda: 0 },
      { year: 2022, revenue: 0, ebitda: 5_000 },
    ])
  })

  it('applies low-confidence financial prefill when yearData is present', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: false,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_low_conf_financials', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        confidence: 0.01,
        fieldsPopulated: [],
        fieldsRemaining: ['company_name'],
        financials: {
          yearData: {
            2024: { revenue: 700_000, ebitda: 70_000 },
            2023: { revenue: 650_000, ebitda: 65_000 },
          },
        },
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      const formData = useManualFormStore.getState().formData as any
      expect(formData.current_year_data).toMatchObject({
        year: 2024,
        revenue: 700_000,
        ebitda: 70_000,
      })
      expect(formData.historical_years_data).toEqual([
        { year: 2023, revenue: 650_000, ebitda: 65_000 },
      ])
    })
  })

  it('hydrates _taxLatencies and _normalizations aliases from session fallback surface', async () => {
    useSessionStore.setState({
      session: {
        reportId: 'val_alias_prefill',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: {
          _taxLatencies: [
            {
              id: 'tl_1',
              type: 'passive',
              description: 'Deferred tax',
              temporary_difference: 100000,
              tax_rate: 25,
            },
          ],
          _normalizations: [
            {
              id: 'norm_1',
              year: 2024,
              status: 'accepted',
              adjustment: 5000,
            },
          ],
        },
      } as any,
    })

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_alias_prefill', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        confidence: 0.4,
        fieldsPopulated: ['company_name'],
        fieldsRemaining: [],
        companyInfo: {
          companyName: 'Alias Co',
          countryCode: 'BE',
        },
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      expect(useTaxLatencyStore.getState().items).toEqual([
        expect.objectContaining({
          id: 'tl_1',
          type: 'passive',
        }),
      ])
      expect(useNormalizationStore.getState().items).toEqual([
        expect.objectContaining({
          id: 'norm_1',
          status: 'accepted',
          year: 2024,
        }),
      ])
    })
  })
})
