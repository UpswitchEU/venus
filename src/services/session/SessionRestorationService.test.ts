import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationTypes'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useImportQualityStore } from '../../store/useImportQualityStore'
import { useNbbPrefillStore } from '../../store/useNbbPrefillStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type { ValuationResponse } from '../../types/valuation'
import { SessionRestorationService } from './SessionRestorationService'

function valuationResultFixture(
  overrides: Partial<ValuationResponse> & Record<string, unknown> = {}
): ValuationResponse {
  return {
    valuation_id: 'val_test',
    company_name: 'Test BV',
    equity_value_low: 0,
    equity_value_mid: 0,
    equity_value_high: 0,
    recommended_asking_price: 0,
    confidence_score: 0,
    overall_confidence: 'medium',
    ...overrides,
  }
}

function valuationResultDetails(result: ValuationResponse | null) {
  return result?.details as { valuation_results?: Record<string, unknown> } | undefined
}

describe('SessionRestorationService', () => {
  beforeEach(() => {
    SessionRestorationService.clearRestorationState()
    useNormalizationStore.getState().clear()
    useTaxLatencyStore.getState().clear()
    useNbbPrefillStore.getState().clear()
    useImportQualityStore.setState({ importQuality: null, provider: null })
    vi.spyOn(useNormalizationStore.getState(), 'loadFromTitan').mockResolvedValue(undefined)
    useManualFormStore.getState().resetForm()
    useManualResultsStore.setState({
      result: null,
      htmlReport: null,
      selectedMethod: 'upswitch_adaptive',
      isCalculating: false,
      error: null,
      calculationProgress: 0,
    })

    useSessionStore.setState({
      session: null,
      status: 'idle',
      errorMessage: null,
      restorationComplete: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not hydrate stores when restoration is cancelled before side effects', async () => {
    const result = await SessionRestorationService.restore(
      'val_cancelled_restore',
      {
        reportId: 'val_cancelled_restore',
        sessionData: {
          company_name: 'Cancelled BV',
          revenue: 1_000_000,
        },
        valuationResult: {
          valuation_id: 'val_cancelled_restore',
          html_report: '<html>Cancelled</html>',
          equity_value_mid: 100000,
          currency: 'EUR',
        },
      },
      { shouldContinue: () => false }
    )

    expect(result.success).toBe(false)
    expect(useManualFormStore.getState().formData.company_name).not.toBe('Cancelled BV')
    expect(useManualResultsStore.getState().result).toBeNull()
    expect(useSessionStore.getState().restorationComplete).toBe(false)
  })

  it('coalesces concurrent restoration for the same report', async () => {
    let releaseTitanLoad: (() => void) | undefined
    vi.mocked(useNormalizationStore.getState().loadFromTitan).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseTitanLoad = resolve
        })
    )

    const first = SessionRestorationService.restore('val_concurrent_restore', {
      reportId: 'val_concurrent_restore',
      sessionData: {
        company_name: 'Concurrent BV',
      },
      valuationResult: {
        valuation_id: 'val_concurrent_restore',
        equity_value_mid: 100000,
        currency: 'EUR',
      },
    })

    expect(SessionRestorationService.isRestorationInProgress('val_concurrent_restore')).toBe(true)

    const second = SessionRestorationService.restore('val_concurrent_restore', {
      reportId: 'val_concurrent_restore',
      sessionData: {
        company_name: 'Should Not Rehydrate BV',
      },
      valuationResult: {
        valuation_id: 'val_concurrent_restore',
        equity_value_mid: 999999,
        currency: 'EUR',
      },
    })

    releaseTitanLoad?.()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(useNormalizationStore.getState().loadFromTitan).toHaveBeenCalledTimes(1)
    expect(firstResult.success).toBe(true)
    expect(secondResult.success).toBe(true)
    expect(useManualFormStore.getState().formData.company_name).toBe('Concurrent BV')
    expect(useManualResultsStore.getState().result?.equity_value_mid).toBe(100000)
    expect(SessionRestorationService.isRestorationInProgress('val_concurrent_restore')).toBe(false)
  })

  it('preserves valuation methods during package-only hydration', () => {
    useManualResultsStore.setState({
      result: valuationResultFixture({
        valuation_id: 'val_existing',
        html_report: '<html>Old report</html>',
        valuation_results: {
          upswitch_adaptive: {
            available: true,
            value: 277000,
            label: 'Upswitch adaptieve marktbenadering',
          },
        },
      }),
      htmlReport: '<html>Old report</html>',
    })

    SessionRestorationService.hydrateFromPackage(
      'val_existing',
      {
        htmlReport: '<html>Fresh report</html>',
        pricingRange: { min: 200000, mid: 277000, max: 320000, currency: 'EUR' },
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {},
      },
      'manual'
    )

    const state = useManualResultsStore.getState()
    expect(state.result?.valuation_results).toMatchObject({
      upswitch_adaptive: {
        available: true,
        value: 277000,
      },
    })
    expect(state.result?.html_report).toBe('<html>Fresh report</html>')
  })

  it('package-only hydration demotes legacy accepted imported ledger addbacks above the defensibility cap', () => {
    SessionRestorationService.hydrateFromPackage(
      'val_package_legacy_imported_norm',
      {
        htmlReport: '<html>Fresh report</html>',
        pricingRange: { min: 200000, mid: 277000, max: 320000, currency: 'EUR' },
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {
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
      },
      'manual'
    )

    expect(useNormalizationStore.getState().items).toEqual([
      expect.objectContaining({
        id: 'imported_sde_2024_610000_0',
        status: 'pending',
      }),
    ])
  })

  it('gap-fills registry fields from _businessInfo when flat session extract is empty', async () => {
    await SessionRestorationService.restore('val_nested_card', {
      reportId: 'val_nested_card',
      sessionData: {
        _businessInfo: {
          company_name: 'Nested BV',
          kbo_number: '0123456749',
        },
      },
      valuationResult: {
        valuation_id: 'val_nested_card',
        equity_value_mid: 100000,
        currency: 'EUR',
      },
    })

    const fd = useManualFormStore.getState().formData
    expect(fd.company_name).toBe('Nested BV')
    expect(fd.kbo_number).toBe('0123456749')
  })

  it('restores nested business card without valuation result (Hermes draft envelope)', async () => {
    await SessionRestorationService.restore('val_card_only_draft', {
      reportId: 'val_card_only_draft',
      sessionData: {
        _businessInfo: {
          company_name: 'Draft BV',
          kbo_number: '0888888888',
        },
      },
    })

    const fd = useManualFormStore.getState().formData
    expect(fd.company_name).toBe('Draft BV')
    expect(fd.kbo_number).toBe('0888888888')
  })

  it('restores persisted method maps when they only exist under details', async () => {
    await SessionRestorationService.restore('val_details_only', {
      reportId: 'val_details_only',
      sessionData: {
        company_name: 'Metaalwerken Geuns',
      },
      valuationResult: {
        valuation_id: 'val_details_only',
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
      htmlReport: '<html>Report</html>',
    })

    const state = useManualResultsStore.getState()
    expect(state.result?.valuation_results).toMatchObject({
      ebitda_multiple: {
        available: true,
        value: 250000,
      },
    })
    expect(valuationResultDetails(state.result)?.valuation_results).toMatchObject({
      ebitda_multiple: {
        available: true,
        value: 250000,
      },
    })
  })

  it('hydrateFromPackage seeds normalization drafts from business_context._imported_ledger_analysis', () => {
    useNormalizationStore.getState().clear()
    useTaxLatencyStore.getState().clear()

    SessionRestorationService.hydrateFromPackage(
      'val_pkg_ledger',
      {
        htmlReport: null,
        pricingRange: null,
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {
          company_name: 'Pkg Co',
          current_year_data: { year: 2022, ebitda: 8000 },
          business_context: {
            _imported_ledger_analysis: {
              latest_fiscal_year: 2022,
              sde_flags: [
                {
                  ledger_code: '610',
                  ledger_name: 'Discretionary',
                  amount: 5000,
                  suggested_question: 'Review?',
                  category: 'discretionary_expense',
                  year: 2022,
                  confidence: 0.7,
                },
              ],
            },
          },
        },
      },
      'manual'
    )

    const items = useNormalizationStore.getState().items
    expect(items.length).toBe(1)
    expect(items[0].ledgerCode).toBe('610')
    expect(items[0].status).toBe('pending')
    expect(useTaxLatencyStore.getState().candidates).toEqual([])
  })

  it('hydrateFromPackage seeds tax latency candidates from business_context._imported_ledger_analysis', () => {
    useTaxLatencyStore.getState().clear()

    SessionRestorationService.hydrateFromPackage(
      'val_pkg_tax_latency',
      {
        htmlReport: null,
        pricingRange: null,
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {
          company_name: 'Pkg Latency Co',
          business_context: {
            _imported_ledger_analysis: {
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
        },
      },
      'manual'
    )

    expect(useTaxLatencyStore.getState().candidates).toEqual([
      expect.objectContaining({
        accountCode: '222000',
        accountName: 'Gebouwen',
        year: 2024,
      }),
    ])
    expect(useTaxLatencyStore.getState()._lastMutationSource).toBe('system')
  })

  it('hydrateFromPackage restores import quality from import_quality alias', () => {
    SessionRestorationService.hydrateFromPackage(
      'val_pkg_import_quality_alias',
      {
        htmlReport: null,
        pricingRange: null,
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {
          company_name: 'Pkg IQ Alias Co',
          import_quality: {
            '2024': {
              confidence_score: 0.91,
              audit_flags: [],
              field_provenance: [],
              total_accounts_processed: 10,
              accounts_mapped_directly: 9,
              accounts_fallback: 1,
              accounts_skipped: 0,
            },
          },
        },
      },
      'manual'
    )

    expect(useImportQualityStore.getState().importQuality).toEqual({
      '2024': expect.objectContaining({
        confidence_score: 0.91,
      }),
    })
  })

  it('hydrateFromPackage flattens _businessInfo and camelCase aliases for identity fields', () => {
    SessionRestorationService.hydrateFromPackage(
      'val_pkg_business_info_aliases',
      {
        htmlReport: null,
        pricingRange: null,
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {
          companyName: '',
          _businessInfo: {
            company_name: 'Alias Manufacturing NV',
            canonical_nace_code: '56.101',
            taxonomy: 'sme/manufacturing',
          },
          businessDescription: 'Strong recurring contracts.',
        },
      },
      'manual'
    )

    const form = useManualFormStore.getState().formData as Record<string, unknown>
    expect(form.company_name).toBe('Alias Manufacturing NV')
    expect(form.canonical_nace_code).toBe('56.101')
    expect(form.taxonomy).toBe('sme/manufacturing')
    expect(form.business_description).toBe('Strong recurring contracts.')
    expect(form._businessInfo).toBeUndefined()
  })

  it('hydrateFromPackage seeds NBB prefill snapshots from official_financials.historicalYears', () => {
    SessionRestorationService.hydrateFromPackage(
      'val_pkg_nbb',
      {
        htmlReport: null,
        pricingRange: null,
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {
          company_name: 'Pkg NBB Co',
          official_financials: {
            source: 'nbb',
            historicalYears: [
              {
                fiscalYear: 2024,
                revenue: 420000,
                ebitda: 90000,
                schemaType: 'full',
                revenueSource: 'turnover',
              },
            ],
          },
        },
      },
      'manual'
    )

    const nbb = useNbbPrefillStore.getState()
    expect(nbb.hasNbbData).toBe(true)
    expect(nbb.getYearSnapshot(2024)).toEqual(
      expect.objectContaining({
        fiscalYear: 2024,
        revenue: 420000,
        ebitda: 90000,
      })
    )
  })

  it('restore seeds SDE drafts from persisted imported ledger when Titan has no normalizations', async () => {
    SessionRestorationService.clearRestorationState('val_restore_ledger')
    useNormalizationStore.getState().clear()
    useTaxLatencyStore.getState().clear()

    await SessionRestorationService.restore('val_restore_ledger', {
      reportId: 'val_restore_ledger',
      sessionData: {
        company_name: 'Restore Co',
        year_data: {
          2023: { ebitda: 20_000 },
        },
        business_context: {
          _imported_ledger_analysis: {
            latest_fiscal_year: 2023,
            sde_flags: [
              {
                ledger_code: '620',
                ledger_name: 'Rent',
                amount: 12_000,
                suggested_question: 'Related party?',
                category: 'related_party_rent',
                year: 2023,
                confidence: 0.55,
              },
            ],
          },
        },
      },
    })

    const items = useNormalizationStore.getState().items
    expect(items.some((i) => i.ledgerCode === '620')).toBe(true)
    expect(items.find((i) => i.ledgerCode === '620')?.status).toBe('pending')
    expect(useTaxLatencyStore.getState().candidates).toEqual([])
  })

  it('restore demotes legacy accepted imported ledger addbacks above the defensibility cap', async () => {
    SessionRestorationService.clearRestorationState('val_restore_legacy_imported_norm')
    useNormalizationStore.getState().clear()

    await SessionRestorationService.restore('val_restore_legacy_imported_norm', {
      reportId: 'val_restore_legacy_imported_norm',
      sessionData: {
        company_name: 'Legacy Auto Norm Co',
        current_year_data: { year: 2024, ebitda: 260_000 },
        _normalizations: [
          {
            id: 'imported_sde_2024_610000_0',
            ledgerCode: '610000',
            ledgerName: 'Services and other goods',
            category: 'other',
            type: 'add',
            value: 206_000,
            adjustment: 206_000,
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
    })

    expect(useNormalizationStore.getState().items).toEqual([
      expect.objectContaining({
        id: 'imported_sde_2024_610000_0',
        status: 'pending',
      }),
    ])
  })

  it('restore skips unsafe NBB prefill snapshots from official_financials historicalYears', async () => {
    SessionRestorationService.clearRestorationState('val_restore_nbb_unsafe')
    useNbbPrefillStore.getState().clear()

    await SessionRestorationService.restore('val_restore_nbb_unsafe', {
      reportId: 'val_restore_nbb_unsafe',
      sessionData: {
        company_name: 'Restore NBB Co',
        official_financials: {
          source: 'nbb',
          historicalYears: [
            {
              fiscalYear: 2023,
              revenue: 300000,
              ebitda: 75000,
              schemaType: 'abbreviated',
              revenueSource: 'gross_margin',
            },
            {
              fiscalYear: 2024,
              revenue: 102_368.9,
              ebitda: 99_658.93,
              schemaType: 'full',
              revenueSource: 'turnover',
            },
          ],
        },
      },
    })

    const nbb = useNbbPrefillStore.getState()
    expect(nbb.hasNbbData).toBe(false)
    expect(nbb.getYearSnapshot(2023)).toBeUndefined()
    expect(nbb.getYearSnapshot(2024)).toBeUndefined()
  })

  it('restore seeds tax latency candidates from persisted imported ledger analysis', async () => {
    SessionRestorationService.clearRestorationState('val_restore_tax_latency')
    useTaxLatencyStore.getState().clear()

    await SessionRestorationService.restore('val_restore_tax_latency', {
      reportId: 'val_restore_tax_latency',
      sessionData: {
        company_name: 'Restore Latency Co',
        business_context: {
          _imported_ledger_analysis: {
            tax_latency_candidates: [
              {
                account_code: '160000',
                account_name: 'Voorzieningen',
                description: 'Voorziening mogelijk tijdelijk fiscaal verschil',
                suggested_question:
                  'Opgelet: MAR 160000 bevat voorzieningen. Wilt u hier een belastinglatentie op toepassen?',
                tax_rate: 25,
                fiscal_year: 2023,
              },
            ],
          },
        },
      },
    })

    expect(useTaxLatencyStore.getState().candidates).toEqual([
      expect.objectContaining({
        accountCode: '160000',
        accountName: 'Voorzieningen',
        year: 2023,
      }),
    ])
    expect(useTaxLatencyStore.getState()._lastMutationSource).toBe('system')
  })

  it('restore seeds tax latency candidates from top-level _imported_ledger_analysis alias', async () => {
    SessionRestorationService.clearRestorationState('val_restore_tax_latency_top_level')
    useTaxLatencyStore.getState().clear()

    await SessionRestorationService.restore('val_restore_tax_latency_top_level', {
      reportId: 'val_restore_tax_latency_top_level',
      sessionData: {
        company_name: 'Top Level Latency Co',
        _imported_ledger_analysis: {
          tax_latency_candidates: [
            {
              account_code: '222100',
              account_name: 'Terreinen',
              description: 'Terreinen met mogelijk tijdelijk fiscaal verschil',
              suggested_question: 'Latentie toepassen?',
              tax_rate: 25,
              fiscal_year: 2024,
            },
          ],
        },
      },
    })

    expect(useTaxLatencyStore.getState().candidates).toEqual([
      expect.objectContaining({
        accountCode: '222100',
        accountName: 'Terreinen',
        year: 2024,
      }),
    ])
  })

  it('restore seeds tax latency candidates even when normalization items already exist', async () => {
    SessionRestorationService.clearRestorationState('val_restore_tax_latency_with_norms')
    const existingNormalization = {
      id: 'norm-1',
      ledgerCode: '610',
      ledgerName: 'Discretionary',
      category: 'other',
      type: 'add',
      value: 5000,
      adjustment: 5000,
      reason: 'Existing normalization',
      source: 'manual',
      status: 'accepted',
      year: 2024,
      applyAllYears: false,
      createdAt: new Date().toISOString(),
    } satisfies NormalizationItem & { createdAt: string }
    useNormalizationStore.getState().setItems([existingNormalization])
    useTaxLatencyStore.getState().clear()

    await SessionRestorationService.restore('val_restore_tax_latency_with_norms', {
      reportId: 'val_restore_tax_latency_with_norms',
      sessionData: {
        company_name: 'Restore Latency With Norms Co',
        business_context: {
          _imported_ledger_analysis: {
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
      },
    })

    expect(useTaxLatencyStore.getState().candidates).toEqual([
      expect.objectContaining({
        accountCode: '222000',
        accountName: 'Gebouwen',
        year: 2024,
      }),
    ])
  })

  it('normalizes restored partial shares_for_sale back to 100', async () => {
    await SessionRestorationService.restore('val_partial_shares', {
      reportId: 'val_partial_shares',
      sessionData: {
        company_name: 'Legacy Stake Co',
        shares_for_sale: 40,
      },
    })

    const state = useManualFormStore.getState()
    expect(state.formData.shares_for_sale).toBe(100)
  })

  it('does not hydrate manual results from ValuationIQ safety-net summary in package', () => {
    const safetyNetHtml =
      '<section class="legacy valuation-summary compact"><h1>Waardeschatting — samenvatting</h1></section>'

    SessionRestorationService.hydrateFromPackage(
      'val_safety_pkg',
      {
        htmlReport: safetyNetHtml,
        pricingRange: { min: 200000, mid: 277000, max: 320000, currency: 'EUR' },
        versions: { current: 1, total: 1, history: [] },
        pdf: { url: null, status: 'none' },
        formData: {},
      },
      'manual'
    )

    const state = useManualResultsStore.getState()
    expect(state.result?.html_report).toBeUndefined()
    expect(state.htmlReport).toBeNull()
  })
})
