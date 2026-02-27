/**
 * Unified Session Store (Bank-Grade Architecture)
 *
 * Replaces:
 * - useSessionStore (valuation sessions)
 * - useGuestSessionStore
 *
 * Key Principles:
 * - Single session type (unified model)
 * - Backend is source of truth (no ownership logic)
 * - Optimistic updates with rollback
 * - Defensive error handling
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Session, unifiedSessionAPI } from '../services/api/session/UnifiedSessionAPI'
import logger from '../utils/logger'

interface SessionStore {
  // State
  session: Session | null
  isLoading: boolean
  error: string | null

  // Actions
  loadSession: (sessionKey: string) => Promise<void>
  createSession: (
    type?: 'valuation' | 'onboarding' | 'assessment',
    data?: Record<string, any>
  ) => Promise<Session>
  updateSession: (updates: Partial<Session>) => Promise<void>
  clearSession: () => void

  // Internal
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

/**
 * Unified Session Store
 */
export const useUnifiedSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      isLoading: false,
      error: null,

      /**
       * Load session from backend
       */
      loadSession: async (sessionKey: string) => {
        set({ isLoading: true, error: null })

        logger.debug(
          {
            session_key: sessionKey.substring(0, 20) + '...',
          },
          '[UnifiedSessionStore] Loading session'
        )

        try {
          const session = await unifiedSessionAPI.get(sessionKey)
          set({ session, isLoading: false })

          logger.debug(
            {
              session_key: session.session_key.substring(0, 20) + '...',
            },
            '[UnifiedSessionStore] Session loaded successfully'
          )
        } catch (error: any) {
          const errorMessage =
            error?.response?.status === 404 ? 'Session not found' : 'Failed to load session'

          set({ error: errorMessage, isLoading: false })

          logger.error(
            {
              session_key: sessionKey.substring(0, 20) + '...',
              error: errorMessage,
            },
            '[UnifiedSessionStore] Failed to load session'
          )

          throw error
        }
      },

      /**
       * Create new session
       */
      createSession: async (type = 'valuation', data = {}) => {
        set({ isLoading: true, error: null })

        logger.info({ type }, '[UnifiedSessionStore] Creating session')

        try {
          const session = await unifiedSessionAPI.create({ type, data })
          set({ session, isLoading: false })

          logger.info(
            {
              session_key: session.session_key.substring(0, 20) + '...',
            },
            '[UnifiedSessionStore] Session created successfully'
          )

          return session
        } catch (error: any) {
          const errorMessage = 'Failed to create session'
          set({ error: errorMessage, isLoading: false })

          logger.error(
            {
              error: errorMessage,
            },
            '[UnifiedSessionStore] Failed to create session'
          )

          throw error
        }
      },

      /**
       * Update session (optimistic update with rollback)
       */
      updateSession: async (updates: Partial<Session>) => {
        const currentSession = get().session
        if (!currentSession) {
          logger.warn('[UnifiedSessionStore] Cannot update: no session loaded')
          return
        }

        // Optimistic update
        const optimisticSession = { ...currentSession, ...updates }
        set({ session: optimisticSession })

        logger.debug(
          {
            session_key: currentSession.session_key.substring(0, 20) + '...',
          },
          '[UnifiedSessionStore] Updating session (optimistic)'
        )

        try {
          // Persist to backend
          const updated = await unifiedSessionAPI.update(currentSession.session_key, {
            data: updates.data,
            view_type: updates.view_type,
            current_step: updates.current_step,
            status: updates.status,
          })

          // Update with backend response
          set({ session: updated })

          logger.debug(
            {
              session_key: updated.session_key.substring(0, 20) + '...',
            },
            '[UnifiedSessionStore] Session updated successfully'
          )
        } catch (error: any) {
          // Rollback on error
          set({ session: currentSession, error: 'Failed to save session' })

          logger.error(
            {
              session_key: currentSession.session_key.substring(0, 20) + '...',
              error: error?.message,
            },
            '[UnifiedSessionStore] Failed to update session, rolled back'
          )

          throw error
        }
      },

      /**
       * Clear session (logout, navigation, etc.)
       */
      clearSession: () => {
        logger.debug('[UnifiedSessionStore] Clearing session')
        set({ session: null, error: null, isLoading: false })
      },

      /**
       * Internal: Set session directly
       */
      setSession: (session: Session | null) => {
        set({ session })
      },

      /**
       * Internal: Set loading state
       */
      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      /**
       * Internal: Set error
       */
      setError: (error: string | null) => {
        set({ error })
      },
    }),
    {
      name: 'unified-session-storage',
      partialize: (state) => ({
        // Only persist session (not loading/error states)
        session: state.session,
      }),
    }
  )
)

/**
 * Convenience hooks
 */
export function useSession() {
  return useUnifiedSessionStore((state) => state.session)
}

export function useSessionLoading() {
  return useUnifiedSessionStore((state) => state.isLoading)
}

export function useSessionError() {
  return useUnifiedSessionStore((state) => state.error)
}
