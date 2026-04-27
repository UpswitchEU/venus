import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionRestorationService } from './SessionRestorationService'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'

describe('SessionRestorationService', () => {
  beforeEach(() => {
    SessionRestorationService.clearRestorationState()
    useNormalizationStore.getState().clear()
    useTaxLatencyStore.getState().clear()
    vi.spyOn(useNormalizationStore.getState(), 'loadFromTitan').mockResolvedValue(undefined)
    useManualFormStore.getState().resetForm()
    useManualResultsStore.setState({
      result: null,
      htmlReport: null,
      selectedMethod: 'upswitch_adaptive',
      isCalculating: false,
      error: null,
      calculationProgress: 0,
    } as any)

    useSessionStore.setState({
      session: null,
      status: 'idle',
      errorMessage: null,
      restorationComplete: false,
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves valuation methods during package-only hydration', () => {
    useManualResultsStore.setState({
      result: {
        valuation_id: 'val_existing',
        html_report: '<html>Old report</html>',
        valuation_results: {
          upswitch_adaptive: {
            available: true,
            value: 277000,
            label: 'Upswitch marktbenadering',
          },
        },
      } as any,
      htmlReport: '<html>Old report</html>',
    } as any)

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
    } as any)

    const state = useManualResultsStore.getState()
    expect(state.result?.valuation_results).toMatchObject({
      ebitda_multiple: {
        available: true,
        value: 250000,
      },
    })
    expect((state.result as any)?.details?.valuation_results).toMatchObject({
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
          business_context: {
            _imported_ledger_analysis: {
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
    expect(items[0].status).toBe('accepted')
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
  })

  it('restore seeds SDE drafts from persisted imported ledger when Titan has no normalizations', async () => {
    SessionRestorationService.clearRestorationState('val_restore_ledger')
    useNormalizationStore.getState().clear()
    useTaxLatencyStore.getState().clear()

    await SessionRestorationService.restore('val_restore_ledger', {
      reportId: 'val_restore_ledger',
      sessionData: {
        company_name: 'Restore Co',
        business_context: {
          _imported_ledger_analysis: {
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
    } as any)

    const items = useNormalizationStore.getState().items
    expect(items.some((i) => i.ledgerCode === '620')).toBe(true)
    expect(useTaxLatencyStore.getState().candidates).toEqual([])
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
    } as any)

    expect(useTaxLatencyStore.getState().candidates).toEqual([
      expect.objectContaining({
        accountCode: '160000',
        accountName: 'Voorzieningen',
        year: 2023,
      }),
    ])
  })

  it('restore seeds tax latency candidates even when normalization items already exist', async () => {
    SessionRestorationService.clearRestorationState('val_restore_tax_latency_with_norms')
    useNormalizationStore.getState().setItems([
      {
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
      } as any,
    ])
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
    } as any)

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
    } as any)

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
