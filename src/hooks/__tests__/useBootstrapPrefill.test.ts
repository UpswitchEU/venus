import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import {
  getBootstrapPrefillMocks,
  renderHook,
  resetBootstrapPrefillHarness,
  restoreBootstrapPrefillHarness,
  useBootstrapPrefill,
  waitFor,
} from './useBootstrapPrefill.testHarness'

const { mockUseBootstrapSafe } = getBootstrapPrefillMocks()

describe('useBootstrapPrefill identity and official filing hydration', () => {
  beforeEach(() => {
    resetBootstrapPrefillHarness()
  })

  afterEach(() => {
    restoreBootstrapPrefillHarness()
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
      const formData = useManualFormStore.getState().formData
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

  it('polls async official enrichment jobs and merges completed filing data', async () => {
    const updatePrefillData = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        result: {
          status: 'ok',
          official_financials: {
            source: 'staatsbladmonitor',
            filing_year: 2024,
            revenue: 1_250_000,
            ebitda: 210_000,
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: false,
      updatePrefillData,
      report: { mode: 'new', reportId: 'val_be_async_official', hasExistingData: false },
      prefillData: {
        sources: ['official_belgian_filing_pending'],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
        officialEnrichmentJobId: 'job_async_official_123',
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/jobs/job_async_official_123', {
        credentials: 'include',
      })
      expect(useManualFormStore.getState().formData.official_financials).toMatchObject({
        source: 'staatsbladmonitor',
        filingYear: 2024,
        revenue: 1_250_000,
        ebitda: 210_000,
      })
      expect(updatePrefillData).toHaveBeenCalledWith(
        expect.objectContaining({
          officialEnrichmentJobId: undefined,
          sources: ['official_belgian_filing'],
        })
      )
    })
  })
})
