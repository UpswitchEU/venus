import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useImportQualityStore } from '../../store/useImportQualityStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type { ValuationSession } from './useBootstrapPrefill.testHarness'
import {
  getBootstrapPrefillMocks,
  PREFILL_SOURCE_ACCOUNTING_INTEGRATION,
  renderHook,
  resetBootstrapPrefillHarness,
  restoreBootstrapPrefillHarness,
  useBootstrapPrefill,
  waitFor,
} from './useBootstrapPrefill.testHarness'

const { mockUseBootstrapSafe } = getBootstrapPrefillMocks()

describe('useBootstrapPrefill imported accounting and fallback surfaces', () => {
  beforeEach(() => {
    resetBootstrapPrefillHarness()
  })

  afterEach(() => {
    restoreBootstrapPrefillHarness()
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
      const formData = useManualFormStore.getState().formData
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
      const formData = useManualFormStore.getState().formData
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
      } as ValuationSession,
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

  it('demotes legacy accepted imported ledger addbacks from session fallback surface', async () => {
    useSessionStore.setState({
      session: {
        reportId: 'val_bootstrap_legacy_imported_norm',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        updatedAt: new Date('2026-06-01T10:00:00.000Z'),
        partialData: {},
        sessionData: {
          current_year_data: { year: 2024, revenue: 1_000_000, ebitda: 100_000 },
          _normalizations: [
            {
              id: 'imported_sde_2024_610000_0',
              ledgerCode: '610000',
              ledgerName: 'Services and other goods',
              category: 'other',
              type: 'add',
              value: 80_000,
              adjustment: 80_000,
              reason: 'Legacy imported auto-suggestion',
              source: 'auto',
              status: 'accepted',
              applyAllYears: false,
              applyYears: [2024],
              year: 2024,
              confidence: 'high',
            },
          ],
        },
      } satisfies ValuationSession,
    })

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: {
        mode: 'new',
        reportId: 'val_bootstrap_legacy_imported_norm',
        hasExistingData: false,
      },
      prefillData: {
        sources: ['session'],
        confidence: 0.4,
        fieldsPopulated: ['company_name'],
        fieldsRemaining: [],
        companyInfo: {
          companyName: 'Legacy Imported Norm Co',
          countryCode: 'BE',
        },
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      expect(useNormalizationStore.getState().items).toEqual([
        expect.objectContaining({
          id: 'imported_sde_2024_610000_0',
          status: 'pending',
        }),
      ])
    })
  })
})
