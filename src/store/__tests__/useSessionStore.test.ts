/**
 * Session Store Integration Tests
 *
 * Covers explicit session state transitions and cross-report race guards.
 *
 * @module store/__tests__/useSessionStore
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionStatus, ValuationSession } from './useSessionStore.testHarness'
import {
  mockHydrateSession,
  mockLoadSession,
  resetSessionStoreHarness,
  useSessionStore,
} from './useSessionStore.testHarness'

beforeEach(resetSessionStoreHarness)

describe('State Machine Transitions', () => {
  it('should start in idle state', () => {
    const state = useSessionStore.getState()
    expect(state.status).toBe('idle')
    expect(state.session).toBeNull()
    expect(state.errorMessage).toBeNull()
  })

  it('should reject loadSession when engine is not initialized', async () => {
    await expect(useSessionStore.getState().loadSession('val_no_engine')).rejects.toThrow(
      'Session not ready'
    )
    expect(useSessionStore.getState().status).toBe('idle')
    expect(mockLoadSession).not.toHaveBeenCalled()
  })

  it('should hydrate an existing optimistic session into a newly created engine', () => {
    const optimisticShell = {
      reportId: 'val_mercury_shell',
      sessionData: { _optimisticMercuryShell: true },
      updatedAt: new Date(),
    }

    useSessionStore.setState({
      session: optimisticShell,
      status: 'loaded' as SessionStatus,
    })

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    expect(mockHydrateSession).toHaveBeenCalledWith(optimisticShell)
  })

  it('should transition IDLE -> LOADING -> LOADED on successful load', async () => {
    // Setup mock — defer resolve so we can observe the loading state
    const mockSession = {
      reportId: 'val_test_123',
      sessionData: { company_name: 'Test Corp' },
      updatedAt: new Date(),
    }
    let releaseLoad: (s: typeof mockSession) => void
    const loadDeferred = new Promise<typeof mockSession>((resolve) => {
      releaseLoad = resolve
    })
    mockLoadSession.mockImplementation(() => loadDeferred)

    // Set engine
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    // Initial state should be idle
    expect(useSessionStore.getState().status).toBe('idle')

    // Start loading
    const loadPromise = useSessionStore.getState().loadSession('val_test_123')

    await Promise.resolve()
    expect(useSessionStore.getState().status).toBe('loading')

    releaseLoad?.(mockSession)
    await loadPromise

    // Should be loaded
    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.reportId).toBe('val_test_123')
    expect(useSessionStore.getState().errorMessage).toBeNull()
  })

  it('should transition IDLE -> LOADING -> ERROR on failed load', async () => {
    // Setup mock to reject
    mockLoadSession.mockRejectedValue(new Error('Session not found'))

    // Set engine
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    // Start loading
    try {
      await useSessionStore.getState().loadSession('val_invalid_123')
    } catch {
      // Expected to throw
    }

    // Should be in error state
    expect(useSessionStore.getState().status).toBe('error')
    expect(useSessionStore.getState().errorMessage).toBe('Session not found')
    expect(useSessionStore.getState().session).toBeNull()
  })

  it('should treat a null engine load result as a 404-shaped not-found error', async () => {
    mockLoadSession.mockResolvedValue(null)
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    await useSessionStore
      .getState()
      .loadSession('val_deleted_123')
      .catch(() => undefined)

    expect(useSessionStore.getState().status).toBe('error')
    expect(useSessionStore.getState().errorMessage).toBe('Session not found: val_deleted_123')
    expect(useSessionStore.getState().session).toBeNull()
  })

  it('should skip load if already loaded with same reportId', async () => {
    const mockSession = {
      reportId: 'val_same_123',
      sessionData: {},
      updatedAt: new Date(),
    }

    // Pre-populate state as loaded
    useSessionStore.setState({
      session: mockSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })

    // Set engine
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    // Try to load same session
    await useSessionStore.getState().loadSession('val_same_123')

    // loadSession on engine should NOT be called (skipped due to already loaded)
    expect(mockLoadSession).not.toHaveBeenCalled()
  })

  it('should refresh a bootstrap-minimal session in place without flipping to loading', async () => {
    // Bootstrap-minimal sessions are written by useBootstrapSync with
    // _bootstrapPrefill/_bootstrapCreated markers and status='loaded'.
    // The progressive-load contract: ValuationSessionManager calls
    // loadSession to fetch the full payload, but the UI must stay
    // mounted (status='loaded' the whole time). Without this contract
    // the user sees a second skeleton flash every Mercury→Venus open.
    // CRITICAL: detection must work for _bootstrapPrefill=true AND =false.
    // Empty existing drafts get `_bootstrapPrefill: false` (no meaningful
    // prefill), but they're still bootstrap-minimal sessions that need to
    // be refreshed in place. Truthy-check regression test below.
    const minimalSession = {
      reportId: 'val_bootstrap_minimal',
      sessionData: { _bootstrapPrefill: true, company_name: 'Bootstrap Co' },
      updatedAt: new Date(),
    }
    const fullSession = {
      reportId: 'val_bootstrap_minimal',
      sessionData: {
        _bootstrapPrefill: true,
        company_name: 'Bootstrap Co',
        revenue: 1_000_000,
      },
      valuationResult: { equity_value_mid: 5_000_000 },
      updatedAt: new Date(),
    }

    let releaseLoad: (s: typeof fullSession) => void
    const loadDeferred = new Promise<typeof fullSession>((resolve) => {
      releaseLoad = resolve
    })
    mockLoadSession.mockImplementation(() => loadDeferred)

    // Pre-populate: bootstrap wrote the minimal session and called
    // completeInitialization, so status='loaded'.
    useSessionStore.setState({
      session: minimalSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    // ValuationSessionManager's needsFullLoad branch triggers this:
    const loadPromise = useSessionStore.getState().loadSession('val_bootstrap_minimal')

    // While the fetch is in flight, status must STAY 'loaded' — not flip
    // to 'loading'. The minimal session is enough to render the wizard.
    await Promise.resolve()
    expect(useSessionStore.getState().status).toBe('loaded')
    // Engine was called (not skipped) because we marked it bootstrap-minimal
    expect(mockLoadSession).toHaveBeenCalledOnce()

    // Resolve the load — full session merges in
    releaseLoad?.(fullSession)
    await loadPromise

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.sessionData).toEqual(
      expect.objectContaining({ revenue: 1_000_000 })
    )
  })

  it('preserves rejected official filing metadata when refreshing a bootstrap session', async () => {
    const reportId = 'val_cbso_rejected_refresh'
    const rejectedOfficialFinancials = {
      source: 'nbb',
      historicalYears: [
        {
          fiscalYear: 2024,
          revenue: 244_665.68,
          ebitda: -34_970.07,
          revenueSource: 'gross_margin',
        },
      ],
      excludedValuationYears: [{ fiscalYear: 2024, reason: 'gross_margin_revenue_proxy' }],
      valuationInputYears: [],
      valuationInputStatus: 'all_rejected',
    }
    const minimalSession = {
      reportId,
      sessionData: {
        _bootstrapPrefill: true,
        company_name: 'KEUKEN',
        official_financials: rejectedOfficialFinancials,
      },
      updatedAt: new Date(),
    }
    const staleServerSession = {
      reportId,
      sessionData: {
        company_name: 'KEUKEN',
        revenue: 1_000_000,
        ebitda: 100_000,
        current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
        historical_years_data: [{ year: 2024, revenue: 900_000, ebitda: 90_000 }],
      },
      updatedAt: new Date(),
    }

    mockLoadSession.mockResolvedValue(staleServerSession)
    useSessionStore.setState({
      session: minimalSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    await useSessionStore.getState().loadSession(reportId)

    const sessionData = useSessionStore.getState().session?.sessionData as Record<string, unknown>
    expect(sessionData.official_financials).toMatchObject({
      valuationInputStatus: 'all_rejected',
      valuationInputYears: [],
    })
    expect(sessionData.revenue).toBeUndefined()
    expect(sessionData.ebitda).toBeUndefined()
    expect(sessionData.current_year_data).toBeUndefined()
    expect(sessionData.historical_years_data).toBeUndefined()
    expect(sessionData.company_name).toBe('KEUKEN')
  })

  it('preserves in-flight recovered HTML when loadSession returns stale server payload', async () => {
    const reportId = 'val_recovered_race'
    const recoveredHtml = '<main>Recovered during load</main>'
    const minimalSession = {
      reportId,
      sessionData: { _bootstrapPrefill: true },
      updatedAt: new Date(),
    }
    const staleServerSession = {
      reportId,
      reportReady: false,
      sessionData: {
        _bootstrapPrefill: true,
        _missingRestorationAssets: ['html_report'],
      },
      valuationResult: { equity_value_mid: 750_000 },
      updatedAt: new Date(),
    }

    let releaseLoad: (s: typeof staleServerSession) => void
    const loadDeferred = new Promise<typeof staleServerSession>((resolve) => {
      releaseLoad = resolve
    })
    mockLoadSession.mockImplementation(() => loadDeferred)

    useSessionStore.setState({
      session: minimalSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const loadPromise = useSessionStore.getState().loadSession(reportId)
    await Promise.resolve()

    useSessionStore.setState({
      session: {
        ...minimalSession,
        htmlReport: recoveredHtml,
        reportReady: true,
        sessionData: {
          ...minimalSession.sessionData,
          _htmlReport: recoveredHtml,
        },
        valuationResult: { equity_value_mid: 750_000, html_report: recoveredHtml },
      },
    })

    releaseLoad?.(staleServerSession)
    await loadPromise

    expect(useSessionStore.getState().session?.htmlReport).toBe(recoveredHtml)
    expect(useSessionStore.getState().session?.reportReady).toBe(true)
  })

  it('should refresh a bootstrap-minimal session even when _bootstrapPrefill is false (empty draft)', async () => {
    // Regression guard for the most subtle Mercury→Venus failure mode:
    // an existing report with no meaningful prefill data. useBootstrapSync
    // writes `_bootstrapPrefill: false` for that case. If detection used a
    // truthy check (=== true) instead of a presence check (in operator),
    // these sessions would short-circuit at the "already loaded" guard
    // and never refresh — the user would stare at an empty wizard with
    // no way to know data was supposed to arrive.
    const emptyMinimalSession = {
      reportId: 'val_empty_draft',
      sessionData: { _bootstrapPrefill: false }, // Explicit false — common case
      updatedAt: new Date(),
    }
    const refreshedSession = {
      reportId: 'val_empty_draft',
      sessionData: { _bootstrapPrefill: false, company_name: 'Restored Co' },
      updatedAt: new Date(),
    }
    mockLoadSession.mockResolvedValue(refreshedSession)

    useSessionStore.setState({
      session: emptyMinimalSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    await useSessionStore.getState().loadSession('val_empty_draft')

    // Detection must fire for _bootstrapPrefill=false → engine called
    expect(mockLoadSession).toHaveBeenCalledOnce()
    // Final state has the refreshed payload
    expect(useSessionStore.getState().session?.sessionData).toEqual(
      expect.objectContaining({ company_name: 'Restored Co' })
    )
  })

  it('should refresh an optimistic Mercury shell in place without returning to loading', async () => {
    const optimisticShell = {
      reportId: 'val_mercury_shell',
      sessionData: { _optimisticMercuryShell: true },
      updatedAt: new Date(),
    }
    const refreshedSession = {
      reportId: 'val_mercury_shell',
      sessionData: { _optimisticMercuryShell: true, company_name: 'Mercury Co' },
      updatedAt: new Date(),
    }
    let releaseLoad: (s: typeof refreshedSession) => void
    const loadDeferred = new Promise<typeof refreshedSession>((resolve) => {
      releaseLoad = resolve
    })
    mockLoadSession.mockImplementation(() => loadDeferred)

    useSessionStore.setState({
      session: optimisticShell,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const loadPromise = useSessionStore.getState().loadSession('val_mercury_shell')
    await Promise.resolve()

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(mockLoadSession).toHaveBeenCalledOnce()

    releaseLoad?.(refreshedSession)
    await loadPromise

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.sessionData).toEqual(
      expect.objectContaining({ company_name: 'Mercury Co' })
    )
  })

  it('should still flip to loading when loading a different reportId', async () => {
    // Guard against the opposite regression: a bootstrap-minimal session
    // for report A should NOT prevent report B from going through the
    // normal idle→loading→loaded transition. This catches the case where
    // someone navigates to a different report mid-session.
    const minimalSession = {
      reportId: 'val_report_A',
      sessionData: { _bootstrapPrefill: true },
      updatedAt: new Date(),
    }
    const otherSession = {
      reportId: 'val_report_B',
      sessionData: {},
      updatedAt: new Date(),
    }
    let releaseLoad: (s: typeof otherSession) => void
    const loadDeferred = new Promise<typeof otherSession>((resolve) => {
      releaseLoad = resolve
    })
    mockLoadSession.mockImplementation(() => loadDeferred)

    useSessionStore.setState({
      session: minimalSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const loadPromise = useSessionStore.getState().loadSession('val_report_B')
    await Promise.resolve()

    // Different reportId — should flip to 'loading' as in the cold path
    expect(useSessionStore.getState().status).toBe('loading')

    releaseLoad?.(otherSession)
    await loadPromise

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.reportId).toBe('val_report_B')
  })

  it('ignores stale cross-report load successes', async () => {
    const oldSession = {
      reportId: 'val_report_A',
      sessionData: { company_name: 'Old Co' },
      updatedAt: new Date('2026-06-03T13:00:00.000Z'),
    }
    const nextSession = {
      reportId: 'val_report_B',
      sessionData: { company_name: 'Next Co' },
      updatedAt: new Date('2026-06-03T13:01:00.000Z'),
    }
    let releaseOld: (session: typeof oldSession) => void = () => undefined
    let releaseNext: (session: typeof nextSession) => void = () => undefined
    const oldLoad = new Promise<typeof oldSession>((resolve) => {
      releaseOld = resolve
    })
    const nextLoad = new Promise<typeof nextSession>((resolve) => {
      releaseNext = resolve
    })
    mockLoadSession.mockImplementation((reportId: string) =>
      reportId === 'val_report_A' ? oldLoad : nextLoad
    )

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const oldPromise = useSessionStore.getState().loadSession('val_report_A')
    await Promise.resolve()
    const nextPromise = useSessionStore.getState().loadSession('val_report_B')
    await Promise.resolve()

    releaseNext(nextSession)
    await nextPromise
    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.reportId).toBe('val_report_B')

    releaseOld(oldSession)
    await oldPromise

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.reportId).toBe('val_report_B')
    expect(useSessionStore.getState().session?.sessionData).toMatchObject({
      company_name: 'Next Co',
    })
    expect(useSessionStore.getState().errorMessage).toBeNull()
  })

  it('ignores stale cross-report load failures', async () => {
    const nextSession = {
      reportId: 'val_report_B',
      sessionData: { company_name: 'Next Co' },
      updatedAt: new Date('2026-06-03T13:02:00.000Z'),
    }
    let rejectOld: (error: Error) => void = () => undefined
    let releaseNext: (session: typeof nextSession) => void = () => undefined
    const oldLoad = new Promise<never>((_resolve, reject) => {
      rejectOld = reject
    })
    const nextLoad = new Promise<typeof nextSession>((resolve) => {
      releaseNext = resolve
    })
    mockLoadSession.mockImplementation((reportId: string) =>
      reportId === 'val_report_A' ? oldLoad : nextLoad
    )

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const oldPromise = useSessionStore.getState().loadSession('val_report_A')
    await Promise.resolve()
    const nextPromise = useSessionStore.getState().loadSession('val_report_B')
    await Promise.resolve()

    releaseNext(nextSession)
    await nextPromise
    rejectOld(new Error('late old load failed'))
    await oldPromise

    expect(useSessionStore.getState().status).toBe('loaded')
    expect(useSessionStore.getState().session?.reportId).toBe('val_report_B')
    expect(useSessionStore.getState().errorMessage).toBeNull()
  })

  it('does not resurrect a session when clearSession wins the load race', async () => {
    const loadedSession = {
      reportId: 'val_cleared_race',
      sessionData: { company_name: 'Cleared Co' },
      updatedAt: new Date('2026-06-03T13:03:00.000Z'),
    }
    let releaseLoad: (session: typeof loadedSession) => void = () => undefined
    const loadDeferred = new Promise<typeof loadedSession>((resolve) => {
      releaseLoad = resolve
    })
    mockLoadSession.mockImplementation(() => loadDeferred)

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    const loadPromise = useSessionStore.getState().loadSession('val_cleared_race')
    await Promise.resolve()
    expect(useSessionStore.getState().status).toBe('loading')

    useSessionStore.getState().clearSession()
    releaseLoad(loadedSession)
    await loadPromise

    expect(useSessionStore.getState().status).toBe('idle')
    expect(useSessionStore.getState().session).toBeNull()
    expect(useSessionStore.getState().errorMessage).toBeNull()
  })

  it('should reset to IDLE on clearSession', async () => {
    const mockSession = {
      reportId: 'val_clear_123',
      sessionData: {},
      updatedAt: new Date(),
    }

    // Set up loaded state
    useSessionStore.setState({
      session: mockSession,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
    })

    // Set engine
    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

    // Clear session
    useSessionStore.getState().clearSession()

    // Should be back to idle
    expect(useSessionStore.getState().status).toBe('idle')
    expect(useSessionStore.getState().session).toBeNull()
    expect(useSessionStore.getState().errorMessage).toBeNull()
  })
})
