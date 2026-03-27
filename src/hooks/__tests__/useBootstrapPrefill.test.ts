import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBootstrapPrefillState, useBootstrapPrefill } from '../useBootstrapPrefill'
import { useManualFormStore } from '../../store/manual/useManualFormStore'

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
    mockUseBootstrapSafe.mockReset()

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
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
        sources: ['accounting_integration'],
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
})
