import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
