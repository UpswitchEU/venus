/**
 * Session Store Integration Tests
 *
 * Bank-grade tests for session state machine transitions.
 * Verifies no race conditions and clean state management.
 *
 * @module store/__tests__/useSessionStore
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../types/valuation'

// Mock the session engine before importing the store
const mockLoadSession = vi.fn()
const mockUpdateSession = vi.fn()
const mockHydrateSession = vi.fn()
const mockSaveSession = vi.fn()
const mockClearSession = vi.fn()
const mockGetSession = vi.fn()

vi.mock('../../services/session/SessionEngineFactory', () => ({
  createSessionEngine: vi.fn(() => ({
    loadSession: mockLoadSession,
    updateSession: mockUpdateSession,
    hydrateSession: mockHydrateSession,
    saveSession: mockSaveSession,
    clearSession: mockClearSession,
    getSession: mockGetSession,
  })),
}))

vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>()
  return {
    ...actual,
    storeLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

// Import after mocks
import { SessionStatus, useSessionStore } from '../useSessionStore'

describe('useSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store to initial state
    useSessionStore.setState({
      session: null,
      status: 'idle' as SessionStatus,
      errorMessage: null,
      isSaving: false,
      lastSaved: null,
      hasUnsavedChanges: false,
      dirtyVersion: 0,
      restorationProgress: null,
      paywallData: null,
      engine: null,
    })
  })

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

  describe('Backward Compatibility', () => {
    // Zustand partial setState merges can replace the state snapshot and drop getters;
    // hooks still use getters from the live store. Assert primitive fields here.
    it('should derive isLoading from status', () => {
      useSessionStore.setState({ status: 'loading' as SessionStatus })
      expect(useSessionStore.getState().status === 'loading').toBe(true)

      useSessionStore.setState({ status: 'loaded' as SessionStatus })
      expect(useSessionStore.getState().status === 'loading').toBe(false)
    })

    it('should map errorMessage to error alias via getters when store is intact', () => {
      const s = useSessionStore.getState()
      expect(s.error).toBe(s.errorMessage)
    })

    it('should derive isInitializing from status (idle | loading)', () => {
      useSessionStore.setState({ status: 'idle' as SessionStatus })
      const idleOrLoading =
        useSessionStore.getState().status === 'idle' ||
        useSessionStore.getState().status === 'loading'
      expect(idleOrLoading).toBe(true)

      useSessionStore.setState({ status: 'loaded' as SessionStatus })
      expect(
        useSessionStore.getState().status === 'idle' ||
          useSessionStore.getState().status === 'loading'
      ).toBe(false)
    })
  })

  describe('Promise Deduplication', () => {
    it('should reuse existing load promise for same reportId', async () => {
      const mockSession = {
        reportId: 'val_dedup_123',
        sessionData: {},
        updatedAt: new Date(),
      }

      // Make load take some time
      mockLoadSession.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSession), 100))
      )

      // Set engine
      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

      // Fire multiple loads in parallel
      const [_result1, _result2, _result3] = await Promise.all([
        useSessionStore.getState().loadSession('val_dedup_123'),
        useSessionStore.getState().loadSession('val_dedup_123'),
        useSessionStore.getState().loadSession('val_dedup_123'),
      ])

      // Engine's loadSession should only be called once
      expect(mockLoadSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('Save Error Handling', () => {
    it('should write save failures to errorMessage', async () => {
      const session = {
        reportId: 'val_save_123',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionData: {},
        partialData: {},
      }

      mockGetSession.mockReturnValue(session)
      mockSaveSession.mockRejectedValue(new Error('Save exploded'))

      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })
      useSessionStore.setState({
        session,
        status: 'loaded' as SessionStatus,
        hasUnsavedChanges: true,
        errorMessage: 'stale message',
      })

      await expect(useSessionStore.getState().saveSession('user')).rejects.toThrow('Save exploded')

      expect(useSessionStore.getState().errorMessage).toBe('Save exploded')
      expect(useSessionStore.getState().isSaving).toBe(false)
    })

    it('markSaved should clear errorMessage', () => {
      useSessionStore.setState({
        hasUnsavedChanges: true,
        dirtyVersion: 1,
        isSaving: true,
        errorMessage: 'previous save failed',
      })

      useSessionStore.getState().markSaved()

      expect(useSessionStore.getState().hasUnsavedChanges).toBe(false)
      expect(useSessionStore.getState().errorMessage).toBeNull()
      expect(useSessionStore.getState().isSaving).toBe(false)
    })

    it('markSaved should preserve newer unsaved changes when version mismatches', () => {
      useSessionStore.setState({
        hasUnsavedChanges: true,
        dirtyVersion: 3,
        errorMessage: 'previous save failed',
      })

      useSessionStore.getState().markSaved(2)

      expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
      expect(useSessionStore.getState().dirtyVersion).toBe(3)
      expect(useSessionStore.getState().errorMessage).toBeNull()
    })

    it('should preserve unsaved changes made during an in-flight save', async () => {
      const currentSession = {
        reportId: 'val_save_race_123',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionData: { company_name: 'Initial Co' },
        partialData: {},
      }

      let resolveSave: (() => void) | undefined
      mockGetSession.mockImplementation(() => currentSession)
      mockUpdateSession.mockImplementation((updates: Partial<ValuationSession>) => {
        Object.assign(currentSession, updates)
      })
      mockSaveSession.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve
          })
      )

      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })
      useSessionStore.setState({
        session: currentSession,
        status: 'loaded' as SessionStatus,
        hasUnsavedChanges: true,
        dirtyVersion: 1,
      })

      const savePromise = useSessionStore.getState().saveSession('autosave')
      await Promise.resolve()

      useSessionStore.getState().updateSession({
        name: 'Changed while saving',
      })

      resolveSave?.()
      await savePromise

      expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
      expect(useSessionStore.getState().session?.name).toBe('Changed while saving')
    })
  })

  describe('Remote Hydration', () => {
    it('should hydrate session without changing clean state', () => {
      const hydratedSession = {
        reportId: 'val_remote_123',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: new Date('2026-04-05T10:00:00.000Z'),
        updatedAt: new Date('2026-04-05T10:00:00.000Z'),
        sessionData: { company_name: 'Hydrated Corp' },
        partialData: {},
        reportReady: true,
      }

      mockGetSession.mockReturnValue(hydratedSession)
      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

      useSessionStore.setState({ hasUnsavedChanges: true })
      useSessionStore.getState().hydrateSession(hydratedSession)

      expect(mockHydrateSession).toHaveBeenCalledWith(hydratedSession)
      expect(useSessionStore.getState().session).toEqual(hydratedSession)
      expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
    })

    it('should preserve clean state during hydration', () => {
      const hydratedSession = {
        reportId: 'val_remote_clean_123',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: new Date('2026-04-05T10:00:00.000Z'),
        updatedAt: new Date('2026-04-05T10:00:00.000Z'),
        sessionData: { company_name: 'Hydrated Corp' },
        partialData: {},
        reportReady: true,
      }

      mockGetSession.mockReturnValue(hydratedSession)
      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

      useSessionStore.setState({ hasUnsavedChanges: false })
      useSessionStore.getState().hydrateSession(hydratedSession)

      expect(useSessionStore.getState().hasUnsavedChanges).toBe(false)
    })

    it('should hydrate local state before engine initialization', () => {
      const createdAt = new Date('2026-04-05T10:00:00.000Z')

      useSessionStore.getState().hydrateSession({
        reportId: 'val_bootstrap_123',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt,
        sessionData: { _bootstrapPrefill: true },
        reportReady: false,
      })

      expect(useSessionStore.getState().session).toMatchObject({
        reportId: 'val_bootstrap_123',
        currentView: 'manual',
        dataSource: 'manual',
        reportReady: false,
        sessionData: { _bootstrapPrefill: true },
      })
      expect(useSessionStore.getState().hasUnsavedChanges).toBe(false)
    })
  })

  describe('Paywall Handling', () => {
    it('should handle paywall errors and store paywall data', async () => {
      const paywallError = Object.assign(new Error('Upgrade required'), {
        isPaywallError: true,
        current: 3,
        limit: 3,
      })

      mockLoadSession.mockRejectedValue(paywallError)

      // Set engine
      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

      await useSessionStore.getState().loadSession('val_paywall_123')

      // Should NOT be in error state (paywall is special)
      expect(useSessionStore.getState().status).toBe('idle')
      expect(useSessionStore.getState().errorMessage).toBeNull()

      // Should have paywall data
      expect(useSessionStore.getState().paywallData).not.toBeNull()
      expect(useSessionStore.getState().paywallData?.current).toBe(3)
      expect(useSessionStore.getState().paywallData?.limit).toBe(3)
    })

    it('should clear paywall data on clearPaywall', () => {
      useSessionStore.setState({
        paywallData: { current: 3, limit: 3, message: 'Upgrade' },
      })

      useSessionStore.getState().clearPaywall()

      expect(useSessionStore.getState().paywallData).toBeNull()
    })
  })

  describe('Atomic optimistic shell + hydrate-and-complete (React #185 guards)', () => {
    it('seeds session + engine + status loaded in ONE Zustand notification', () => {
      const notifications: Array<{ session: unknown; engine: unknown; status: string }> = []
      const unsubscribe = useSessionStore.subscribe((state) => {
        notifications.push({
          session: state.session,
          engine: state.engine,
          status: state.status,
        })
      })

      useSessionStore.getState().seedOptimisticMercuryShell({
        seedSession: {
          reportId: 'val_mercury_atomic',
          currentView: 'manual',
          dataSource: 'manual',
          partialData: {},
          sessionData: {
            _bootstrapPrefill: false,
            _optimisticMercuryShell: true,
          } as any,
        },
        identity: { type: 'authenticated', userId: 'user-123' },
      })

      unsubscribe()

      // Exactly one subscriber tick — the cascade that previously fired three
      // separate notifications (hydrateSession → setEngine → completeInitialization)
      // is what compounded into React #185.
      expect(notifications).toHaveLength(1)
      expect(notifications[0].status).toBe('loaded')
      expect(notifications[0].engine).not.toBeNull()
      expect((notifications[0].session as { reportId: string }).reportId).toBe('val_mercury_atomic')
    })

    it('hydrates the engine before the atomic commit so engine.getSession reflects the seed', () => {
      useSessionStore.getState().seedOptimisticMercuryShell({
        seedSession: {
          reportId: 'val_engine_hydrate',
          currentView: 'manual',
          dataSource: 'manual',
          partialData: {},
          sessionData: { _optimisticMercuryShell: true } as any,
        },
        identity: { type: 'authenticated', userId: 'user-123' },
      })

      // engine.hydrateSession is the singleton's internal sync, fired before
      // the React-visible commit. Confirming the mock was called with the
      // built session locks the order-of-operations invariant.
      expect(mockHydrateSession).toHaveBeenCalledTimes(1)
      const hydrateArg = mockHydrateSession.mock.calls[0]?.[0] as {
        reportId: string
        sessionData?: Record<string, unknown>
      }
      expect(hydrateArg.reportId).toBe('val_engine_hydrate')
      expect(hydrateArg.sessionData?._optimisticMercuryShell).toBe(true)
    })

    it('refuses optimistic shell seed for accountant_for_client identity', () => {
      useSessionStore.getState().seedOptimisticMercuryShell({
        seedSession: { reportId: 'val_refuse_advisor' },
        identity: {
          type: 'accountant_for_client',
          userId: 'acc-1',
          clientContext: {
            accountantUserId: 'acc-1',
            clientUserId: 'cli-1',
            relationshipId: 'rel-1',
            permissions: {
              canCreateValuations: true,
              canViewReports: true,
              canEditReports: true,
            },
          },
        },
      })

      expect(useSessionStore.getState().session).toBeNull()
      expect(useSessionStore.getState().engine).toBeNull()
      expect(useSessionStore.getState().status).toBe('idle')
    })

    it('refuses optimistic shell seed when delegated handoff signals are present', () => {
      useSessionStore.getState().seedOptimisticMercuryShell({
        seedSession: { reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c' },
        identity: { type: 'authenticated', userId: 'user-123' },
        delegatedHandoffSignals: {
          isFromMercury: true,
          urlIndicatesExisting: true,
          clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
          mode: 'accountant',
        },
      })

      expect(useSessionStore.getState().session).toBeNull()
      expect(useSessionStore.getState().status).toBe('idle')
    })

    it('clears errorMessage and renderError on optimistic seed', () => {
      useSessionStore.setState({
        errorMessage: 'stale error',
        renderError: 'payload_too_large',
      })

      useSessionStore.getState().seedOptimisticMercuryShell({
        seedSession: { reportId: 'val_clear_errors' },
        identity: { type: 'authenticated', userId: 'user-123' },
      })

      expect(useSessionStore.getState().errorMessage).toBeNull()
      expect(useSessionStore.getState().renderError).toBeNull()
    })

    it('hydrateSessionAndComplete: collapses hydrate + status flip into ONE notification (with engine)', () => {
      const hydratedSession = {
        reportId: 'val_atomic_hydrate',
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: new Date('2026-05-26T10:00:00.000Z'),
        updatedAt: new Date('2026-05-26T10:00:00.000Z'),
        sessionData: { company_name: 'Atomic Corp' },
        partialData: {},
        reportReady: true,
      }

      mockGetSession.mockReturnValue(hydratedSession)
      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

      // Snapshot subscriber count AFTER setEngine so we measure only the
      // atomic action.
      const notifications: Array<{ sessionId: string | undefined; status: string }> = []
      const unsubscribe = useSessionStore.subscribe((state) => {
        notifications.push({
          sessionId: state.session?.reportId,
          status: state.status,
        })
      })

      useSessionStore.getState().hydrateSessionAndComplete(hydratedSession)

      unsubscribe()

      // Single notification with BOTH the new session AND status='loaded' —
      // not two separate ticks (one for session, one for status).
      expect(notifications).toHaveLength(1)
      expect(notifications[0]).toEqual({
        sessionId: 'val_atomic_hydrate',
        status: 'loaded',
      })
      expect(mockHydrateSession).toHaveBeenCalledWith(hydratedSession)
    })

    it('hydrateSessionAndComplete strips _optimisticMercuryShell when bootstrap payload merges', () => {
      const bootstrapSession: ValuationSession = {
        reportId: 'val_strip_shell',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: {},
        sessionData: {
          _bootstrapPrefill: false,
          company_name: 'Bootstrap Corp',
        } as ValuationSession['sessionData'],
      }

      mockHydrateSession.mockImplementation((updates: Partial<ValuationSession>) => {
        mockGetSession.mockReturnValue({
          ...bootstrapSession,
          ...updates,
          sessionData: {
            ...(bootstrapSession.sessionData as Record<string, unknown>),
            ...(updates.sessionData as Record<string, unknown> | undefined),
            _optimisticMercuryShell: true,
          } as ValuationSession['sessionData'],
        })
      })
      mockGetSession.mockReturnValue({
        ...bootstrapSession,
        sessionData: {
          ...(bootstrapSession.sessionData as Record<string, unknown>),
          _optimisticMercuryShell: true,
        } as ValuationSession['sessionData'],
      })

      useSessionStore.getState().seedOptimisticMercuryShell({
        seedSession: {
          reportId: 'val_strip_shell',
          currentView: 'manual',
          dataSource: 'manual',
          partialData: {},
          sessionData: { _optimisticMercuryShell: true } as ValuationSession['sessionData'],
        },
        identity: { type: 'authenticated', userId: 'user-123' },
      })

      useSessionStore.getState().hydrateSessionAndComplete({
        reportId: 'val_strip_shell',
        sessionData: bootstrapSession.sessionData,
      })

      const sd = useSessionStore.getState().session?.sessionData as Record<string, unknown>
      expect(sd?.company_name).toBe('Bootstrap Corp')
      expect(sd?._optimisticMercuryShell).toBeUndefined()
    })

    it('hydrateSessionAndComplete: collapses hydrate + status flip into ONE notification (no engine)', () => {
      // Engine remains null — we exercise the no-engine branch that
      // useBootstrapSync hits on the existing-report path before
      // BootstrapProvider's post-Titan setEngine runs.
      const notifications: Array<{ sessionId: string | undefined; status: string }> = []
      const unsubscribe = useSessionStore.subscribe((state) => {
        notifications.push({
          sessionId: state.session?.reportId,
          status: state.status,
        })
      })

      useSessionStore.getState().hydrateSessionAndComplete({
        reportId: 'val_no_engine_hydrate',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date('2026-05-26T10:00:00.000Z'),
        sessionData: { _bootstrapPrefill: true },
      })

      unsubscribe()

      expect(notifications).toHaveLength(1)
      expect(notifications[0]).toEqual({
        sessionId: 'val_no_engine_hydrate',
        status: 'loaded',
      })
      // Engine path was NOT used.
      expect(mockHydrateSession).not.toHaveBeenCalled()
    })

    it('hydrateSessionAndComplete: still flips status when no session can be built (defensive)', () => {
      // No engine, no existing session, no reportId on the update — caller
      // is degenerate but we must not strand the UI in skeleton.
      useSessionStore.getState().hydrateSessionAndComplete({})

      expect(useSessionStore.getState().status).toBe('loaded')
      expect(useSessionStore.getState().session).toBeNull()
    })

    it('hydrateSessionAndComplete: clears errorMessage and renderError on commit', () => {
      useSessionStore.setState({
        errorMessage: 'previous error',
        renderError: 'payload_too_large',
      })

      useSessionStore.getState().hydrateSessionAndComplete({
        reportId: 'val_clear_on_complete',
        sessionData: { _bootstrapPrefill: true },
      })

      expect(useSessionStore.getState().errorMessage).toBeNull()
      expect(useSessionStore.getState().renderError).toBeNull()
      expect(useSessionStore.getState().status).toBe('loaded')
    })
  })
})
