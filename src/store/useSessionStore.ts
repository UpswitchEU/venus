/**
 * Unified Session Store (Cursor-Style Simplicity)
 *
 * Single source of truth for both manual and conversational flows.
 * Replaces useManualSessionStore + useConversationalSessionStore.
 *
 * Key Features:
 * - Promise cache prevents duplicate loads
 * - Atomic state updates
 * - Simple API (loadSession, updateSession, clearSession)
 * - No orchestration, no asset stores
 * - Optimistic rendering support
 *
 * @module store/useSessionStore
 */

import { create } from 'zustand'
import { sessionService } from '../services'
import type { ValuationSession } from '../types/valuation'
import type { RestorationProgress } from '../hooks/useRestorationProgress'
import { storeLogger } from '../utils/logger'

interface SessionStore {
  // State
  session: ValuationSession | null
  isLoading: boolean
  error: string | null

  // Save state (M&A workflow)
  isSaving: boolean
  lastSaved: Date | null
  hasUnsavedChanges: boolean

  // ✅ NEW: Initialization tracking to suppress toasts during setup
  isInitializing: boolean

  // ✅ NEW: Restoration progress tracking
  restorationProgress: RestorationProgress | null

  // ✅ NEW: Callback for save success notifications
  onSaveSuccess?: () => void
  // ✅ NEW: Callback for asset save success notifications (when valuation assets are saved)
  onAssetSaveSuccess?: () => void

  // ⭐ PLAN ENFORCEMENT: Paywall state
  paywallData: {
    current: number
    limit: number
    message: string
  } | null

  // Actions
  loadSession: (
    reportId: string,
    flow?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ) => Promise<void>
  updateSession: (updates: Partial<ValuationSession>) => void
  updateSessionData: (data: Partial<any>) => Promise<void> // Async for hook compatibility
  saveSession: (reason?: 'user' | 'autosave' | 'system') => Promise<void>
  clearSession: () => void
  completeInitialization: () => void // ✅ NEW: Mark initialization as complete

  // ⭐ PLAN ENFORCEMENT: Paywall actions
  clearPaywall: () => void

  // Helpers
  getReportId: () => string | null
  getSessionData: () => any | null
  markSaved: () => void
  markUnsaved: () => void
}

// Promise cache to prevent duplicate loads (Cursor pattern)
const loadingPromises = new Map<string, Promise<void>>()

/**
 * Unified Session Store
 *
 * Handles both manual and conversational flows with single store.
 */
export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  onSaveSuccess: undefined,
  onAssetSaveSuccess: undefined,
  session: null,
  isLoading: false,
  error: null,
  isSaving: false,
  lastSaved: null,
  hasUnsavedChanges: false,
  isInitializing: true, // ✅ NEW: Start in initializing state
  restorationProgress: null, // ✅ NEW: Restoration progress tracking
  paywallData: null, // ⭐ PLAN ENFORCEMENT: Paywall state

  /**
   * Load session from backend/cache
   *
   * Features:
   * - Promise cache prevents duplicate calls
   * - Atomic state updates
   * - Error handling with clear messages
   * - Auto-creates session if not found (for new reports)
   * - Merges prefilledQuery into partialData if provided
   */
  loadSession: async (
    reportId: string,
    flow?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ) => {
    const state = get()

    // ✅ FIX: GUARD 1: Already loaded for this reportId (verify exact match)
    // This prevents unnecessary reloads and ensures session matches reportId
    if (state.session?.reportId === reportId && !state.error && !state.isLoading) {
      storeLogger.debug('[Session] Already loaded, skipping', { reportId })
      return
    }

    // ✅ FIX: GUARD 2: Clear stale session if reportId doesn't match
    // This prevents race conditions where old session data shows during new load
    if (state.session && state.session.reportId !== reportId) {
      storeLogger.debug('[Session] Clearing stale session before loading new one', {
        oldReportId: state.session.reportId,
        newReportId: reportId,
      })
      set({ session: null, error: null })
    }

    // ✅ FIX: GUARD 3: Already loading (promise cache) - reuse existing promise
    // This prevents concurrent loads for the same reportId
    if (loadingPromises.has(reportId)) {
      storeLogger.debug('[Session] Already loading, reusing promise', { reportId })
      try {
        await loadingPromises.get(reportId)
        // ✅ FIX: Verify loaded session matches reportId after promise resolves
        // This handles race conditions where promise resolves with wrong session
        const finalState = get()
        if (finalState.session?.reportId === reportId) {
          return
        } else {
          storeLogger.warn('[Session] Promise resolved but session mismatch, reloading', {
            expectedReportId: reportId,
            actualReportId: finalState.session?.reportId,
          })
          // Fall through to load again
        }
      } catch (error) {
        // If promise rejected, fall through to retry load
        storeLogger.debug('[Session] Cached promise rejected, retrying load', {
          reportId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Fall through to load again
      }
    }

    // ✅ FIX: Create load promise with reportId validation
    // Capture reportId at start to detect race conditions
    const expectedReportId = reportId
    const loadPromise = (async () => {
      // ✅ FIX: Double-check reportId hasn't changed before setting loading state
      // This prevents race conditions when reportId changes rapidly
      const currentState = get()
      if (currentState.session?.reportId === expectedReportId && !currentState.error) {
        storeLogger.debug('[Session] ReportId already loaded during promise creation', {
          reportId: expectedReportId,
        })
        return
      }

      set({ isLoading: true, error: null, isInitializing: true }) // ✅ NEW: Mark as initializing

      try {
        storeLogger.info('[Session] Loading session', { reportId: expectedReportId, flow, prefilledQuery })

        // Load from SessionService (handles cache, backend, merging, auto-creation)
        const session = await sessionService.loadSession(expectedReportId, flow, prefilledQuery)

        if (!session) {
          // Session not found and couldn't be auto-created - redirect to home
          storeLogger.warn('[Session] Session not found, redirecting to home', { expectedReportId })
          
          // Only redirect if we're in a browser environment
          if (typeof window !== 'undefined') {
            // Preserve locale if present in URL
            const currentPath = window.location.pathname
            const localeMatch = currentPath.match(/^\/(en|nl)/)
            const locale = localeMatch ? localeMatch[1] : 'en'
            
            // Redirect to home page to create new session
            window.location.href = `/${locale}`
            return
          }
          
          throw new Error(`Session not found: ${expectedReportId}`)
        }

        // ✅ FIX: Validate session reportId matches expected reportId
        // This prevents race conditions where wrong session is loaded
        if (session.reportId !== expectedReportId) {
          storeLogger.error('[Session] Loaded session reportId mismatch', {
            expectedReportId,
            actualReportId: session.reportId,
          })
          throw new Error(
            `Session reportId mismatch: expected ${expectedReportId}, got ${session.reportId}`
          )
        }

        // ✅ FIX: Double-check reportId hasn't changed during async load
        // If reportId changed, don't update state (prevents stale data)
        const finalState = get()
        if (finalState.session?.reportId !== expectedReportId && finalState.session) {
          storeLogger.warn('[Session] ReportId changed during load, discarding result', {
            expectedReportId,
            currentReportId: finalState.session.reportId,
          })
          return // Don't update state if reportId changed
        }

        // ✅ FIX: Only mark as saved if session was explicitly updated (user saved changes)
        // Don't use calculatedAt - calculation completion != user save
        // Don't default to new Date() - new reports shouldn't show "Saved" immediately
        set({
          session,
          isLoading: false,
          error: null,
          hasUnsavedChanges: false,
          lastSaved: session.updatedAt || null, // Only set if user explicitly saved
          isSaving: false,
          // ✅ FIX: Keep isInitializing true - will be set to false by completeInitialization after restoration
          // This ensures forms don't render until restoration completes
        })

        storeLogger.info('[Session] Session loaded successfully', {
          reportId,
          currentView: session.currentView,
          hasSessionData: !!session.sessionData,
          hasHtmlReport: !!session.htmlReport,
          hasInfoTabHtml: !!session.infoTabHtml,
          hasValuationResult: !!session.valuationResult,
          markedAsSaved: true,
        })

        // ✅ FIX: Fallback - set isInitializing to false after delay if restoration doesn't complete it
        // This ensures initialization completes even if restoration doesn't run
        setTimeout(() => {
          const currentState = get()
          // Only set to false if still initializing and session matches (prevents race conditions)
          if (currentState.isInitializing && currentState.session?.reportId === expectedReportId) {
            set({ isInitializing: false })
            storeLogger.debug('[Session] Initialization complete (fallback timeout)', { reportId: expectedReportId })
          }
        }, 2000) // 2 second fallback - restoration should complete faster
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Failed to load session'

        // ⭐ PLAN ENFORCEMENT: Handle paywall errors separately
        const isPaywallError = (error as any).isPaywallError === true

        if (isPaywallError) {
          storeLogger.info('[Session] Load blocked by plan enforcement (paywall)', {
            reportId: expectedReportId,
            current: (error as any).current,
            limit: (error as any).limit,
          })

          // Set paywall state (separate from generic error)
          set({
            isLoading: false,
            error: null, // Don't set generic error for paywall
            isInitializing: false,
            paywallData: {
              current: (error as any).current || 0,
              limit: (error as any).limit || 1,
              message: rawMessage,
            },
          })

          // Don't re-throw paywall errors (handled by UI via paywallData)
          return
        }

        // Determine user-friendly error message based on error type
        let userMessage = rawMessage
        const statusCode = (error as any).response?.status || (error as any).status
        
        if (rawMessage.includes('timeout') || rawMessage.includes('Timeout')) {
          userMessage = 'Connection timed out. Please check your internet connection and try again.'
        } else if (statusCode === 401 || statusCode === 403) {
          userMessage = 'Authentication failed. Please reload the page or contact support.'
        } else if (statusCode === 404) {
          // Session not found - redirect to home instead of showing error
          storeLogger.warn('[Session] Session not found (404), redirecting to home', { expectedReportId })
          
          if (typeof window !== 'undefined') {
            const currentPath = window.location.pathname
            const localeMatch = currentPath.match(/^\/(en|nl)/)
            const locale = localeMatch ? localeMatch[1] : 'en'
            
            window.location.href = `/${locale}`
            return
          }
          
          userMessage = 'Session not found. Redirecting to home page...'
        } else if (statusCode === 500 || statusCode >= 500) {
          userMessage = 'Server error. Our team has been notified. Please try again later.'
        } else if (rawMessage.includes('Network') || rawMessage.includes('fetch')) {
          userMessage = 'Network error. Please check your connection and try again.'
        }

        // Generic error handling
        storeLogger.error('[Session] Load failed', {
          reportId: expectedReportId,
          error: rawMessage,
          statusCode,
          userMessage,
        })

        // ✅ FIX: Only update error state if reportId hasn't changed during load
        // This prevents overwriting state for a different reportId
        const errorState = get()
        if (errorState.session?.reportId !== expectedReportId && errorState.session) {
          storeLogger.warn('[Session] ReportId changed during error, not updating error state', {
            expectedReportId,
            currentReportId: errorState.session.reportId,
          })
          return // Don't update error state if reportId changed
        }

        set({
          error: userMessage,
          isLoading: false,
          isInitializing: false,
        })

        throw error
      }
    })()

    // Store in promise cache
    loadingPromises.set(reportId, loadPromise)

    try {
      await loadPromise
    } finally {
      // Clean up promise cache
      loadingPromises.delete(reportId)
    }
  },

  /**
   * Update entire session object
   */
  updateSession: (updates: Partial<ValuationSession>) => {
    set((state) => {
      if (!state.session) {
        storeLogger.warn('[Session] Cannot update: no active session')
        return state
      }

      const updatedSession = {
        ...state.session,
        ...updates,
      }

      storeLogger.debug('[Session] Session updated', {
        reportId: state.session.reportId,
        fieldsUpdated: Object.keys(updates).length,
      })

      // ✅ CRITICAL: Update localStorage cache immediately (Cursor/ChatGPT pattern)
      // This ensures page refresh loads the updated session with all assets
      // ✅ FIX: Exclude HTML reports before caching to prevent quota exceeded errors
      try {
        const { globalSessionCache } = require('../utils/sessionCacheManager')

        storeLogger.debug('[Session] Starting optimistic cache update', {
          reportId: state.session.reportId,
          updateKeys: Object.keys(updates),
          hasHtmlReportInUpdate: !!updates.htmlReport,
          hasInfoTabHtmlInUpdate: !!updates.infoTabHtml,
        })

        // Exclude HTML reports before caching (they're too large for localStorage)
        // HTML reports are fetched from backend on demand when needed
        const { htmlReport, infoTabHtml, ...sessionWithoutHtml } = updatedSession
        globalSessionCache.set(state.session.reportId, sessionWithoutHtml)

        storeLogger.info('[Session] Cache updated optimistically (SUCCESS)', {
          reportId: state.session.reportId,
          fieldsUpdated: Object.keys(updates).length,
          hasHtmlReport: !!updatedSession.htmlReport,
          htmlReportLength: updatedSession.htmlReport?.length || 0,
          hasInfoTabHtml: !!updatedSession.infoTabHtml,
          infoTabHtmlLength: updatedSession.infoTabHtml?.length || 0,
          hasValuationResult: !!updatedSession.valuationResult,
          hasSessionData: !!updatedSession.sessionData,
        })
      } catch (cacheError) {
        storeLogger.error('[Session] Failed to update cache optimistically', {
          reportId: state.session.reportId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          stack: cacheError instanceof Error ? cacheError.stack : undefined,
        })
      }

      return {
        ...state,
        session: updatedSession,
        hasUnsavedChanges: true,
      }
    })
  },

  /**
   * Update session data (form fields)
   * Async for compatibility with hooks expecting Promise<void>
   */
  updateSessionData: async (data: Partial<any>) => {
    set((state) => {
      if (!state.session) {
        storeLogger.warn('[Session] Cannot update data: no active session')
        return state
      }

      // ✅ FIX: Check if data actually changed before marking as unsaved
      // This prevents restoration from triggering "unsaved changes"
      const currentSessionData = state.session.sessionData || ({} as any)
      const dataAny = data as any
      const dataChanged = Object.keys(data).some((key) => {
        const newValue = dataAny[key]
        const oldValue = (currentSessionData as any)[key]

        // Deep comparison for nested objects
        if (
          typeof newValue === 'object' &&
          typeof oldValue === 'object' &&
          newValue !== null &&
          oldValue !== null
        ) {
          return JSON.stringify(newValue) !== JSON.stringify(oldValue)
        }

        return newValue !== oldValue
      })

      // If data hasn't changed, don't mark as unsaved
      if (!dataChanged) {
        storeLogger.debug('[Session] Session data unchanged, skipping update', {
          reportId: state.session.reportId,
          fieldsChecked: Object.keys(data).length,
        })
        return state
      }

      const updatedSession = {
        ...state.session,
        sessionData: {
          ...state.session.sessionData,
          ...data,
        },
      }

      storeLogger.debug('[Session] Session data updated', {
        reportId: state.session.reportId,
        fieldsUpdated: Object.keys(data).length,
        dataChanged: true,
      })

      return {
        ...state,
        session: updatedSession,
        hasUnsavedChanges: true,
      }
    })
  },

  /**
   * Save session to backend
   * @param reason - Reason for save: 'user' (explicit user action), 'autosave' (debounced form sync), 'system' (restoration/system-triggered)
   */
  saveSession: async (reason: 'user' | 'autosave' | 'system' = 'autosave') => {
    const state = get()

    if (!state.session) {
      storeLogger.warn('[Session] Cannot save: no active session')
      return
    }

    // ✅ FIX: Capture hasUnsavedChanges BEFORE save starts (for toast callback)
    // This ensures we know if there were actual changes, even if state changes during save
    const hadUnsavedChangesBeforeSave = state.hasUnsavedChanges

    set({ isSaving: true, error: null })

    try {
      storeLogger.info('[Session] Saving session', {
        reportId: state.session.reportId,
        reason,
        hadUnsavedChanges: hadUnsavedChangesBeforeSave,
      })

      // Save via SessionService
      await sessionService.saveSession(state.session.reportId, state.session.sessionData || {})

      storeLogger.info('[Session] Session saved successfully', {
        reportId: state.session.reportId,
        reason,
        hadUnsavedChanges: hadUnsavedChangesBeforeSave,
      })

      // ✅ FIX: Only trigger callback for 'user' saves (manual CTA clicks), not 'autosave' (form syncs)
      // This ensures toast only shows when user explicitly saves, not during form interactions
      if (reason === 'user' && state.onSaveSuccess) {
        // Call callback - it will read the ref value which should still be true if there were changes
        state.onSaveSuccess()
      }

      // ✅ FIX: Update state AFTER callback is invoked
      // This ensures the ref still has the "before save" value when callback reads it
      set({
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaved: new Date(),
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save session'

      storeLogger.error('[Session] Save failed', {
        reportId: state.session.reportId,
        error: message,
        reason,
      })

      set({
        isSaving: false,
        error: message,
      })

      throw error
    }
  },

  /**
   * Clear session state
   */
  clearSession: () => {
    const state = get()

    storeLogger.info('[Session] Clearing session', {
      reportId: state.session?.reportId,
    })

    set({
      session: null,
      isLoading: false,
      isSaving: false,
      error: null,
      lastSaved: null,
      hasUnsavedChanges: false,
      isInitializing: true, // ✅ NEW: Reset to initializing state
    })
  },

  /**
   * Mark initialization as complete
   * This allows toasts to show for subsequent saves/loads
   */
  completeInitialization: () => {
    set({ isInitializing: false })
    storeLogger.debug('[Session] Initialization complete - toasts enabled')
  },

  /**
   * ⭐ PLAN ENFORCEMENT: Clear paywall state
   * Called when user closes paywall modal or upgrades
   */
  clearPaywall: () => {
    storeLogger.debug('[Session] Clearing paywall state')
    set({ paywallData: null })
  },

  /**
   * Get current report ID
   */
  getReportId: () => {
    const { session } = get()
    return session?.reportId || null
  },

  /**
   * Get session data
   */
  getSessionData: () => {
    const { session } = get()
    return session?.sessionData || null
  },

  /**
   * Mark session as saved
   */
  markSaved: () => {
    set({
      hasUnsavedChanges: false,
      lastSaved: new Date(),
      isSaving: false,
      error: null,
    })

    storeLogger.debug('[Session] Marked as saved')
  },

  /**
   * Mark session as having unsaved changes
   */
  markUnsaved: () => {
    set({
      hasUnsavedChanges: true,
    })
  },
}))
