/**
 * Session Store Integration Tests
 *
 * Covers atomic Mercury optimistic handoff and hydrate-and-complete notifications.
 *
 * @module store/__tests__/useSessionStore
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ValuationSession } from './useSessionStore.testHarness'
import {
  mockGetSession,
  mockHydrateSession,
  resetSessionStoreHarness,
  useSessionStore,
} from './useSessionStore.testHarness'

beforeEach(resetSessionStoreHarness)

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
        } as ValuationSession['sessionData'],
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
        sessionData: { _optimisticMercuryShell: true } as ValuationSession['sessionData'],
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
