/**
 * Session Store Integration Tests
 *
 * Bank-grade tests for session state machine transitions.
 * Verifies no race conditions and clean state management.
 *
 * @module store/__tests__/useSessionStore
 */

import { beforeEach, describe, expect, it, Mock, vi } from 'vitest'

// Mock the session engine before importing the store
const mockLoadSession = vi.fn()
const mockUpdateSession = vi.fn()
const mockSaveSession = vi.fn()
const mockClearSession = vi.fn()
const mockGetSession = vi.fn()

vi.mock('../../services/session/SessionEngineFactory', () => ({
  createSessionEngine: vi.fn(() => ({
    loadSession: mockLoadSession,
    updateSession: mockUpdateSession,
    saveSession: mockSaveSession,
    clearSession: mockClearSession,
    getSession: mockGetSession,
  })),
}))

vi.mock('../../utils/logger', () => ({
  storeLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

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

    it('should transition IDLE -> LOADING -> LOADED on successful load', async () => {
      // Setup mock
      const mockSession = {
        reportId: 'val_test_123',
        sessionData: { company_name: 'Test Corp' },
        updatedAt: new Date(),
      }
      mockLoadSession.mockResolvedValue(mockSession)

      // Set engine
      useSessionStore.getState().setEngine({ type: 'authenticated', userId: 'user-123' })

      // Initial state should be idle
      expect(useSessionStore.getState().status).toBe('idle')

      // Start loading
      const loadPromise = useSessionStore.getState().loadSession('val_test_123')

      // After starting, should be loading
      await new Promise((resolve) => setTimeout(resolve, 0)) // Allow microtask to run
      expect(useSessionStore.getState().status).toBe('loading')

      // Wait for completion
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
    it('should expose isLoading as computed property', () => {
      useSessionStore.setState({ status: 'loading' as SessionStatus })
      expect(useSessionStore.getState().isLoading).toBe(true)

      useSessionStore.setState({ status: 'loaded' as SessionStatus })
      expect(useSessionStore.getState().isLoading).toBe(false)
    })

    it('should expose error as computed property', () => {
      useSessionStore.setState({ errorMessage: 'Test error' })
      expect(useSessionStore.getState().error).toBe('Test error')

      useSessionStore.setState({ errorMessage: null })
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should expose isInitializing as computed property', () => {
      useSessionStore.setState({ status: 'idle' as SessionStatus })
      expect(useSessionStore.getState().isInitializing).toBe(true)

      useSessionStore.setState({ status: 'loading' as SessionStatus })
      expect(useSessionStore.getState().isInitializing).toBe(true)

      useSessionStore.setState({ status: 'loaded' as SessionStatus })
      expect(useSessionStore.getState().isInitializing).toBe(false)

      useSessionStore.setState({ status: 'error' as SessionStatus })
      expect(useSessionStore.getState().isInitializing).toBe(false)
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
      const [result1, result2, result3] = await Promise.all([
        useSessionStore.getState().loadSession('val_dedup_123'),
        useSessionStore.getState().loadSession('val_dedup_123'),
        useSessionStore.getState().loadSession('val_dedup_123'),
      ])

      // Engine's loadSession should only be called once
      expect(mockLoadSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('Paywall Handling', () => {
    it('should handle paywall errors and store paywall data', async () => {
      const paywallError = new Error('Upgrade required')
      ;(paywallError as any).isPaywallError = true
      ;(paywallError as any).current = 3
      ;(paywallError as any).limit = 3

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
})
