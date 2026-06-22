/**
 * Session Store Integration Tests
 *
 * Covers persistence failure handling, remote hydration, and paywall state.
 *
 * @module store/__tests__/useSessionStore
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionStatus, ValuationSession } from './useSessionStore.testHarness'
import {
  mockGetSession,
  mockHydrateSession,
  mockLoadSession,
  mockSaveSession,
  mockUpdateSession,
  resetSessionStoreHarness,
  useSessionStore,
} from './useSessionStore.testHarness'

beforeEach(resetSessionStoreHarness)

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

  it('keeps transient auth-service autosave failures out of errorMessage', async () => {
    const session = {
      reportId: 'val_auth_blip_123',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionData: { company_name: 'Restaurant Decan' },
      partialData: {},
    }

    mockGetSession.mockReturnValue(session)
    mockSaveSession.mockRejectedValue(
      new Error('Failed to save session: Authentication service temporarily unavailable')
    )

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })
    useSessionStore.setState({
      session,
      status: 'loaded' as SessionStatus,
      hasUnsavedChanges: true,
      errorMessage: 'stale message',
    })

    await expect(useSessionStore.getState().saveSession('autosave')).resolves.toBeUndefined()

    expect(useSessionStore.getState().errorMessage).toBeNull()
    expect(useSessionStore.getState().isSaving).toBe(false)
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('keeps text-only HTTP 503 autosave failures out of errorMessage', async () => {
    const session = {
      reportId: 'val_status_text_blip_123',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionData: { company_name: 'Restaurant Decan' },
      partialData: {},
    }

    mockGetSession.mockReturnValue(session)
    mockSaveSession.mockRejectedValue(
      new Error('Failed to save session: Request failed with status code 503')
    )

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })
    useSessionStore.setState({
      session,
      status: 'loaded' as SessionStatus,
      hasUnsavedChanges: true,
      errorMessage: 'stale message',
    })

    await expect(useSessionStore.getState().saveSession('autosave')).resolves.toBeUndefined()

    expect(useSessionStore.getState().errorMessage).toBeNull()
    expect(useSessionStore.getState().isSaving).toBe(false)
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('keeps client-aborted HTTP 499 autosave failures out of errorMessage', async () => {
    const session = {
      reportId: 'val_status_text_499_123',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionData: { company_name: 'Restaurant Decan' },
      partialData: {},
    }

    mockGetSession.mockReturnValue(session)
    mockSaveSession.mockRejectedValue(
      new Error('Failed to save session: Request failed with status code 499')
    )

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })
    useSessionStore.setState({
      session,
      status: 'loaded' as SessionStatus,
      hasUnsavedChanges: true,
      errorMessage: 'stale message',
    })

    await expect(useSessionStore.getState().saveSession('autosave')).resolves.toBeUndefined()

    expect(useSessionStore.getState().errorMessage).toBeNull()
    expect(useSessionStore.getState().isSaving).toBe(false)
    expect(useSessionStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('surfaces autosave failures where an incidental number only looks like HTTP 503', async () => {
    const session = {
      reportId: 'val_incidental_503_123',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionData: { company_name: 'Restaurant Decan' },
      partialData: {},
    }

    mockGetSession.mockReturnValue(session)
    mockSaveSession.mockRejectedValue(
      new Error('Failed to save session: validation failed for registry row 503')
    )

    useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })
    useSessionStore.setState({
      session,
      status: 'loaded' as SessionStatus,
      hasUnsavedChanges: true,
      errorMessage: 'stale message',
    })

    await expect(useSessionStore.getState().saveSession('autosave')).rejects.toThrow(
      'validation failed for registry row 503'
    )

    expect(useSessionStore.getState().errorMessage).toBe(
      'Failed to save session: validation failed for registry row 503'
    )
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
