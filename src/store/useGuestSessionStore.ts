/**
 * Guest Session Store
 *
 * Single Responsibility: Manage session state atomically for both guest and authenticated users
 * Uses Zustand for atomic updates and race condition prevention
 *
 * Features:
 * - Atomic state updates (no race conditions via Zustand)
 * - Synchronous access from interceptors
 * - Automatic initialization on any page (home or report)
 * - Works for BOTH guest and authenticated users
 *   - Guest users: Session tracked via guest_session_id
 *   - Authenticated users: Session tracked via guest_session_id (for API consistency)
 *     Backend uses user_id from auth cookie for authorization
 * - Session persistence via localStorage (synced with service)
 * - Promise caching prevents duplicate initialization requests
 *
 * Note: Despite the name "GuestSessionStore", this store manages sessions for
 * all users (guest and authenticated). The name reflects the backend API endpoint
 * (`/api/guest/session`) but the store works universally.
 */

import { create } from 'zustand'
import { guestSessionService } from '../services/guestSessionService'
import { createContextLogger } from '../utils/logger'

const guestSessionLogger = createContextLogger('GuestSessionStore')

const GUEST_SESSION_KEY = 'upswitch_guest_session_id'
const GUEST_SESSION_EXPIRES_KEY = 'upswitch_guest_session_expires_at'

interface GuestSessionState {
  // Session state
  sessionId: string | null
  expiresAt: string | null
  isInitialized: boolean
  isInitializing: boolean
  initializationPromise: Promise<string | null> | null

  // Actions
  initializeSession: () => Promise<string | null>
  getSessionId: () => string | null
  clearSession: () => void
  ensureSession: () => Promise<string | null>
  syncFromLocalStorage: () => void
}

/**
 * Guest Session Store
 *
 * Manages guest session state atomically using Zustand.
 * Ensures session is initialized on any page access (home or report).
 * Works for both guest and authenticated users.
 *
 * Note: We sync with localStorage (managed by guestSessionService) rather than
 * using Zustand persist middleware to avoid conflicts and keep single source of truth.
 */
export const useGuestSessionStore = create<GuestSessionState>((set, get) => ({
  // Initial state - sync from localStorage on creation
  sessionId: typeof window !== 'undefined' ? localStorage.getItem(GUEST_SESSION_KEY) : null,
  expiresAt: typeof window !== 'undefined' ? localStorage.getItem(GUEST_SESSION_EXPIRES_KEY) : null,
  isInitialized: false,
  isInitializing: false,
  initializationPromise: null,

  /**
   * Sync state from localStorage (called when service updates localStorage)
   */
  syncFromLocalStorage: () => {
    if (typeof window === 'undefined') return

    const sessionId = localStorage.getItem(GUEST_SESSION_KEY)
    const expiresAt = localStorage.getItem(GUEST_SESSION_EXPIRES_KEY)

    set({ sessionId, expiresAt })
  },

  /**
   * Get current session ID synchronously
   * Safe to call from interceptors and synchronous code
   */
  getSessionId: () => {
    // Always sync from localStorage first (single source of truth)
    get().syncFromLocalStorage()
    return get().sessionId
  },

  /**
   * Initialize guest session
   * Atomic operation - prevents multiple simultaneous initializations using promise cache
   */
  initializeSession: async () => {
    const state = get()

    // Sync from localStorage first
    state.syncFromLocalStorage()

    // If already initialized and session is valid, return it
    if (state.sessionId && state.expiresAt) {
      const expiresAt = new Date(state.expiresAt)
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)

      // If expires in more than 1 hour, trust stored session
      if (expiresAt > oneHourFromNow) {
        guestSessionLogger.debug('Using cached session (expires in more than 1 hour)', {
          sessionId: state.sessionId.substring(0, 15) + '...',
        })
        set({ isInitialized: true })
        return state.sessionId
      }
    }

    // If already initializing, return the existing promise
    if (state.initializationPromise) {
      guestSessionLogger.debug('Session initialization already in progress, reusing promise')
      return state.initializationPromise
    }

    // Create new initialization promise
    const initPromise = (async () => {
      // Mark as initializing (atomic update)
      set({ isInitializing: true })

      try {
        // Use the service to get or create session (it has its own promise cache)
        const sessionId = await guestSessionService.getOrCreateSession()

        // Sync state from localStorage (service stores it there)
        get().syncFromLocalStorage()

        // Update state atomically
        set({
          isInitialized: true,
          isInitializing: false,
          initializationPromise: null,
        })

        guestSessionLogger.info('Guest session initialized', {
          sessionId: sessionId.substring(0, 15) + '...',
        })

        return sessionId
      } catch (error) {
        guestSessionLogger.error('Failed to initialize guest session', { error })

        // Reset initializing flag
        set({
          isInitializing: false,
          initializationPromise: null,
        })

        return null
      } finally {
        // Clear promise cache on completion (only if still active)
        set((currentState) => {
          if (currentState.initializationPromise === initPromise) {
            return { ...currentState, initializationPromise: null }
          }
          return currentState
        })
      }
    })()

    // ATOMIC: Store promise using functional update (same pattern as manual/conversational stores)
    // This atomically checks if another promise was set, and only sets if none exists
    let cachedPromise: Promise<string | null> | null = null
    set((currentState) => {
      // Double-check: if another promise was set between check and set, use that one
      if (currentState.initializationPromise) {
        cachedPromise = currentState.initializationPromise
        return currentState // No change needed
      }
      // Set our promise atomically
      return { ...currentState, initializationPromise: initPromise }
    })

    // If another promise was cached (race condition), return that instead
    if (cachedPromise) {
      guestSessionLogger.debug('Another initialization started concurrently, using that promise')
      return cachedPromise
    }

    return initPromise
  },

  /**
   * Ensure session exists (initialize if needed)
   * Safe to call multiple times - uses atomic state to prevent race conditions
   * 
   * ✅ FIX: Skip guest session creation for authenticated users
   */
  ensureSession: async () => {
    // ✅ FIX: Check if user is authenticated before creating guest session
    // Authenticated users should NOT have guest sessions
    try {
      const { useAuthStore } = await import('./useAuthStore')
      const isAuthenticated = useAuthStore.getState().user !== null
      
      if (isAuthenticated) {
        guestSessionLogger.debug('Skipping guest session for authenticated user')
        return null
      }
    } catch (error) {
      // If authStore import fails, continue with guest session creation
      guestSessionLogger.warn('Failed to check auth status, continuing with guest session creation', { error })
    }

    const state = get()

    // Sync from localStorage first
    state.syncFromLocalStorage()

    // If we have a valid session, return it
    if (state.sessionId && state.expiresAt) {
      const expiresAt = new Date(state.expiresAt)
      if (expiresAt > new Date()) {
        return state.sessionId
      }
    }

    // Initialize if needed
    return get().initializeSession()
  },

  /**
   * Clear guest session
   * Used when user authenticates or logs out
   */
  clearSession: () => {
    guestSessionService.clearSession()
    set({
      sessionId: null,
      expiresAt: null,
      isInitialized: false,
      isInitializing: false,
      initializationPromise: null,
    })

    guestSessionLogger.info('Guest session cleared')
  },
}))
