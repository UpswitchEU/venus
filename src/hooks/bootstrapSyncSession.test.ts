import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionBootstrapState } from '../lib/bootstrap/types'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { useSessionStore } from '../store/useSessionStore'
import { syncBootstrapSession } from './bootstrapSyncSession'

function makeBootstrapState(overrides: Partial<SessionBootstrapState> = {}): SessionBootstrapState {
  return {
    identity: {
      type: 'authenticated',
      userId: 'user-1',
    },
    report: {
      mode: 'existing',
      reportId: 'val_bootstrap_sync',
      hasExistingData: true,
      status: 'active',
    },
    prefillData: {
      sources: ['session'],
      confidence: 0,
      fieldsPopulated: [],
      fieldsRemaining: [],
    },
    ui: {
      suggestedFlow: 'manual',
      showWelcomeBack: false,
      resumableSession: false,
      showKboVerification: false,
      showAccountantBanner: false,
    },
    bootstrapVersion: '2.0.0',
    bootstrappedAt: new Date('2026-06-20T00:00:00.000Z'),
    bootstrapDurationMs: 1,
    ...overrides,
  } as SessionBootstrapState
}

describe('syncBootstrapSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useManualFormStore.getState().resetForm()
    useSessionStore.setState({
      session: null,
      status: 'idle',
      errorMessage: null,
      renderError: null,
      engine: null,
      restorationComplete: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gap-fills an existing session through the atomic hydrate+complete path', () => {
    useSessionStore.setState({
      session: {
        reportId: 'val_existing_gap_fill',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        updatedAt: new Date('2026-06-20T00:00:00.000Z'),
        partialData: {},
        sessionData: {
          company_name: 'Existing Co',
        },
      },
      status: 'loaded',
    })
    const hydrateAndCompleteSpy = vi.spyOn(useSessionStore.getState(), 'hydrateSessionAndComplete')
    const hydrateSessionSpy = vi.spyOn(useSessionStore.getState(), 'hydrateSession')

    syncBootstrapSession(
      makeBootstrapState({
        report: {
          mode: 'existing',
          reportId: 'val_existing_gap_fill',
          hasExistingData: true,
          status: 'active',
        },
        prefillData: {
          sources: ['session'],
          confidence: 0.4,
          fieldsPopulated: ['city'],
          fieldsRemaining: [],
          companyInfo: {
            companyName: 'Incoming Co',
            city: 'Brussels',
          },
        },
      })
    )

    expect(hydrateAndCompleteSpy).toHaveBeenCalledTimes(1)
    expect(hydrateSessionSpy).not.toHaveBeenCalled()
    expect(useSessionStore.getState().session?.sessionData).toMatchObject({
      company_name: 'Existing Co',
      city: 'Brussels',
      _bootstrapPrefill: true,
    })
  })

  it('hydrates country-only new report prefill even below the confidence gate', () => {
    syncBootstrapSession(
      makeBootstrapState({
        report: {
          mode: 'new',
          reportId: 'val_new_country_only',
          hasExistingData: false,
          status: 'draft',
        },
        prefillData: {
          sources: ['url_params'],
          confidence: 0,
          fieldsPopulated: [],
          fieldsRemaining: [],
          companyInfo: {
            countryCode: 'be',
          },
        },
      })
    )

    expect(useSessionStore.getState().session?.sessionData).toMatchObject({
      _bootstrapCreated: true,
      _bootstrapPrefill: false,
      country_code: 'BE',
    })
    expect(useManualFormStore.getState().formData.country_code).toBe('BE')
  })

  it('hydrates current year and visible grid from existing-report accounting yearData', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-28T12:00:00Z'))

    useManualFormStore.getState().updateFormData({
      current_year_data: { year: 2025, revenue: 0, ebitda: 0 },
      yearlyFinancials: [
        { year: '2025', revenue: 0, ebitda: 0 },
        { year: '2024', revenue: 0, ebitda: 0 },
        { year: '2023', revenue: 0, ebitda: 0 },
      ],
    })

    syncBootstrapSession(
      makeBootstrapState({
        report: {
          mode: 'existing',
          reportId: 'val_lgs_existing',
          hasExistingData: true,
          status: 'active',
        },
        prefillData: {
          sources: ['session', 'accounting_integration'],
          confidence: 0.8,
          fieldsPopulated: ['company_name', 'current_year_data'],
          fieldsRemaining: [],
          companyInfo: {
            companyName: 'LGS workshop',
            countryCode: 'BE',
          },
          financials: {
            revenue: 11_282_327,
            ebitda: 1_200_000,
            dataSource: 'silverfin',
            yearData: {
              2025: { revenue: 11_282_327, ebitda: 1_200_000 },
              2024: { revenue: 11_282_327, ebitda: 1_115_950 },
              2023: { revenue: 11_282_327, ebitda: 1_045_723 },
            },
          },
        },
      })
    )

    const formData = useManualFormStore.getState().formData
    expect(formData.current_year_data).toEqual({
      year: 2025,
      revenue: 11_282_327,
      ebitda: 1_200_000,
    })
    expect(formData.historical_years_data).toEqual([
      { year: 2023, revenue: 11_282_327, ebitda: 1_045_723 },
      { year: 2024, revenue: 11_282_327, ebitda: 1_115_950 },
    ])
    expect(formData.yearlyFinancials).toEqual([
      { year: '2025', revenue: 11_282_327, ebitda: 1_200_000 },
      { year: '2024', revenue: 11_282_327, ebitda: 1_115_950 },
      { year: '2023', revenue: 11_282_327, ebitda: 1_045_723 },
    ])
  })
})
