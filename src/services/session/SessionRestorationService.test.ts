import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionRestorationService } from './SessionRestorationService'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useSessionStore } from '../../store/useSessionStore'

describe('SessionRestorationService', () => {
  beforeEach(() => {
    SessionRestorationService.clearRestorationState()
    useNormalizationStore.getState().clear()
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
            label: 'UpSwitch Adaptive',
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
    expect(items[0].status).toBe('pending')
  })

  it('restore seeds SDE drafts from persisted imported ledger when Titan has no normalizations', async () => {
    SessionRestorationService.clearRestorationState('val_restore_ledger')
    useNormalizationStore.getState().clear()

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
})
