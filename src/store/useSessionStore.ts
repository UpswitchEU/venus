/**
 * Unified Session Store (Cursor-Style Simplicity)
 *
 * Twin Engine Architecture: Routes to GuestSessionEngine or AuthenticatedSessionEngine
 * based on bootstrap identity. Zero mixing of guest/auth logic.
 *
 * Key Features:
 * - Promise cache prevents duplicate loads
 * - Atomic state updates
 * - Simple API (loadSession, updateSession, clearSession)
 * - Engine abstraction (guest vs auth)
 * - Optimistic rendering support
 *
 * @module store/useSessionStore
 */

import { create } from 'zustand'
import type { RestorationProgress } from '../hooks/useRestorationProgress'
import type { ValuationSession } from '../types/valuation'
import { storeLogger } from '../utils/logger'
import type { ISessionEngine } from '../services/session/SessionEngine'
import { createSessionEngine } from '../services/session/SessionEngineFactory'
import type { IdentityState } from '../lib/bootstrap/types'

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

  // ✅ TWIN ENGINE: Engine instance (created based on identity)
  engine: ISessionEngine | null

  // Actions
  setEngine: (identity: IdentityState) => void // Set engine based on identity
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
  engine: null, // ✅ TWIN ENGINE: Engine instance (set via setEngine)

  /**
   * Set engine based on identity
   * Called from BootstrapProvider when identity is resolved
   */
  setEngine: (identity: IdentityState) => {
    const engine = createSessionEngine(identity)
    set({ engine })
    storeLogger.debug('[Session] Engine set', {
      identityType: identity.type,
      engineType: identity.type === 'guest' ? 'GuestSessionEngine' : 'AuthenticatedSessionEngine',
    })
  },

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
    let expectedReportId = reportId // let - may be reassigned if URL redirects
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
        storeLogger.debug('[Session] Loading session', {
          reportId: expectedReportId,
          flow,
          prefilledQuery,
        })

        // ✅ TWIN ENGINE: Load from engine (routes to Guest or Auth engine)
        const state = get()
        if (!state.engine) {
          throw new Error('Session engine not initialized. Call setEngine() first.')
        }
        
        const session = await state.engine.loadSession(expectedReportId, flow, prefilledQuery)

        if (!session) {
          // Session not found and couldn't be auto-created
          storeLogger.warn('[Session] Session not found', { expectedReportId })

          // Only redirect if we're viewing a specific report page
          // Don't redirect if we're already on home page to avoid infinite loops
          if (typeof window !== 'undefined') {
            const currentPath = window.location.pathname

            // Only redirect if we're on a report detail page (contains /reports/)
            // This prevents redirect loops on home page
            if (currentPath.includes('/reports/')) {
              const localeMatch = currentPath.match(/^\/(en|nl)/)
              const locale = localeMatch ? localeMatch[1] : 'en'

              storeLogger.info('[Session] Redirecting from report page to home', {
                from: currentPath,
                to: `/${locale}`,
              })

              // Redirect to home page to create new session
              window.location.href = `/${locale}`
              return
            } else {
              // We're already on home page or another page - don't redirect
              // Just set error state and let the page handle it
              storeLogger.warn(
                '[Session] Not found but already on home page, setting error state',
                {
                  currentPath,
                }
              )
            }
          }

          throw new Error(`Session not found: ${expectedReportId}`)
        }

        // ✅ FIX: Validate session reportId matches expected reportId
        // This prevents race conditions where wrong session is loaded
        // EXCEPTION: If URL was redirected (reportId changed), accept the new session
        if (session.reportId !== expectedReportId) {
          // Check if URL was redirected to match the new session
          const currentUrl = typeof window !== 'undefined' ? window.location.pathname : ''
          const urlReportId = currentUrl.match(/\/reports\/([^/?]+)/)?.[1]
          
          if (urlReportId === session.reportId) {
            // URL was redirected to match new session - this is OK
            storeLogger.info('[Session] URL redirected to match new session', {
              originalReportId: expectedReportId,
              newReportId: session.reportId,
            })
            // Update expectedReportId to match the new session
            expectedReportId = session.reportId
          } else {
            // Genuine mismatch - reject it
            storeLogger.error('[Session] Loaded session reportId mismatch', {
              expectedReportId,
              actualReportId: session.reportId,
              urlReportId,
            })
            throw new Error(
              `Session reportId mismatch: expected ${expectedReportId}, got ${session.reportId}`
            )
          }
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
        
        // ✅ DIAGNOSTIC: Verify business card data is present before storing
        const sessionCompanyName = (session.sessionData as any)?.company_name
        const hasCompanyName = sessionCompanyName && sessionCompanyName.trim() !== ''
        storeLogger.info('[Session] Storing session in Zustand store', {
          reportId,
          hasSessionData: !!session.sessionData,
          companyName: sessionCompanyName,
          hasCompanyName,
          companyNameLength: sessionCompanyName?.length || 0,
          businessTypeId: (session.sessionData as any)?.business_type_id,
          sessionDataKeys: session.sessionData ? Object.keys(session.sessionData).slice(0, 10) : [],
        })
        
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

        storeLogger.debug('[Session] Session loaded successfully', {
          reportId,
          currentView: session.currentView,
          hasSessionData: !!session.sessionData,
          hasHtmlReport: !!session.htmlReport,
          hasInfoTabHtml: !!session.infoTabHtml,
          hasValuationResult: !!session.valuationResult,
          markedAsSaved: true,
          // ✅ DIAGNOSTIC: Verify business card data is in stored session
          storedCompanyName: (session.sessionData as any)?.company_name,
          storedBusinessTypeId: (session.sessionData as any)?.business_type_id,
        })

        // ✅ FIX: Fallback - set isInitializing to false after delay if restoration doesn't complete it
        // This ensures initialization completes even if restoration doesn't run
        // ✅ CRITICAL: Reduced timeout to 1 second since restoration should be fast
        setTimeout(() => {
          const currentState = get()
          // Only set to false if still initializing and session matches (prevents race conditions)
          if (currentState.isInitializing && currentState.session?.reportId === expectedReportId) {
            set({ isInitializing: false })
            storeLogger.debug('[Session] Initialization complete (fallback timeout)', {
              reportId: expectedReportId,
            })
          }
        }, 1000) // 1 second fallback - restoration should complete faster
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

        // ✅ FIX: Check if error is ValidationError - don't retry these
        const { ValidationError } = await import('../types/errors')
        const isValidationError = error instanceof ValidationError
        
        if (isValidationError) {
          storeLogger.error('[Session] Validation error - stopping retries', {
            reportId: expectedReportId,
            error: rawMessage,
          })
          // Set error state and stop - don't retry validation errors
          set({
            error: 'Invalid session data. Please try creating a new valuation.',
            isLoading: false,
            isInitializing: false,
          })
          return // Don't throw - just stop loading
        }

        // Determine user-friendly error message based on error type
        let userMessage = rawMessage
        const statusCode = (error as any).response?.status || (error as any).status

        if (rawMessage.includes('timeout') || rawMessage.includes('Timeout')) {
          userMessage = 'Connection timed out. Please check your internet connection and try again.'
        } else if (statusCode === 401 || statusCode === 403) {
          userMessage = 'Authentication failed. Please reload the page or contact support.'
        } else if (statusCode === 404) {
          // Session not found (404) - only redirect if we're on a report page
          storeLogger.warn('[Session] Session not found (404)', { expectedReportId })

          if (typeof window !== 'undefined') {
            const currentPath = window.location.pathname

            // Only redirect if we're on a report detail page
            if (currentPath.includes('/reports/')) {
              const localeMatch = currentPath.match(/^\/(en|nl)/)
              const locale = localeMatch ? localeMatch[1] : 'en'

              storeLogger.info('[Session] Redirecting from report page to home (404)', {
                from: currentPath,
                to: `/${locale}`,
              })

              window.location.href = `/${locale}`
              return
            } else {
              // Already on home page - just show error
              storeLogger.warn('[Session] 404 but already on home page, showing error', {
                currentPath,
              })
            }
          }

          userMessage = 'Session not found. Please start a new valuation.'
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
      } finally {
        // ✅ CRITICAL FIX: Always reset isInitializing, even if error is thrown
        // This prevents infinite loading state when errors occur
        const finalState = get()
        if (finalState.isInitializing && finalState.session?.reportId === expectedReportId) {
          storeLogger.debug('[Session] Ensuring isInitializing reset in finally block', {
            reportId: expectedReportId,
          })
          set({ isInitializing: false })
        }
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
   * 
   * ✅ TWIN ENGINE: Delegates to engine (Guest or Auth)
   */
  updateSession: (updates: Partial<ValuationSession>) => {
    const state = get()
    if (!state.engine) {
      storeLogger.warn('[Session] Cannot update - engine not initialized')
      return
    }

    // Delegate to engine
    state.engine.updateSession(updates)

    // Update local state from engine
    const updatedSession = state.engine.getSession()
    if (updatedSession) {
      set({
        session: updatedSession,
        hasUnsavedChanges: true,
      })
    }
  },

  /**
   * Update session data (form fields)
   * ✅ TWIN ENGINE: Delegates to engine
   */
  updateSessionData: async (data: Partial<any>) => {
    const state = get()
    if (!state.engine) {
      storeLogger.warn('[Session] Cannot update data - engine not initialized')
      return
    }

    if (!state.session) {
      storeLogger.warn('[Session] Cannot update data: no active session')
      return
    }

    // Delegate to engine
    state.engine.updateSession({
      sessionData: {
        ...(state.session.sessionData || {}),
        ...data,
      },
    })

    // Update local state from engine
    const updatedSession = state.engine.getSession()
    if (updatedSession) {
      set({
        session: updatedSession,
        hasUnsavedChanges: true,
      })
    }
  },

  /**
   * Save session to backend
   * ✅ TWIN ENGINE: Delegates to engine (Guest or Auth)
   * @param reason - Reason for save: 'user' (explicit user action), 'autosave' (debounced form sync), 'system' (restoration/system-triggered)
   */
  saveSession: async (reason: 'user' | 'autosave' | 'system' = 'autosave') => {
    const state = get()

    if (!state.engine) {
      storeLogger.warn('[Session] Cannot save - engine not initialized')
      return
    }

    if (!state.session) {
      storeLogger.warn('[Session] Cannot save: no active session')
      return
    }

    // ✅ FIX: Capture hasUnsavedChanges BEFORE save starts (for toast callback)
    // This ensures we know if there were actual changes, even if state changes during save
    const hadUnsavedChangesBeforeSave = state.hasUnsavedChanges

    set({ isSaving: true, error: null })

    try {
      storeLogger.debug('[Session] Saving session', {
        reportId: state.session.reportId,
        reason,
        hadUnsavedChanges: hadUnsavedChangesBeforeSave,
      })

      // ✅ TWIN ENGINE: Delegate to engine
      await state.engine.saveSession(reason)

      // Update local state from engine
      const savedSession = state.engine.getSession()

      // ✅ FIX: Update store with the saved session (includes business card data merged after save)
      // This ensures the store has the latest session data, including any business card data
      // that was fetched and merged during the save/reload process
      if (savedSession) {
        // ✅ DIAGNOSTIC: Verify business card data is in saved session
        const savedCompanyName = (savedSession.sessionData as any)?.company_name
        const hasSavedCompanyName = savedCompanyName && savedCompanyName.trim() !== ''
        storeLogger.debug('[Session] Updating store with saved session', {
          reportId: state.session.reportId,
          hasSavedSession: !!savedSession,
          savedCompanyName,
          hasSavedCompanyName,
          savedBusinessTypeId: (savedSession.sessionData as any)?.business_type_id,
        })
        
        // Update session in store with the saved session (includes merged business card data)
        set({
          session: savedSession,
        })
      }

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
      
      // ✅ WORLD-CLASS FIX: Don't crash UI for non-critical errors
      // Rate limits (429) and network errors are transient - don't show error screen
      const isRateLimit = message.includes('429') || message.includes('rate limit') || message.includes('too many requests')
      const isNetworkError = message.includes('network') || message.includes('timeout') || message.includes('ECONNREFUSED')
      const isNonCritical = isRateLimit || isNetworkError
      
      if (isNonCritical) {
        storeLogger.warn('[Session] Non-critical save error (will retry automatically)', {
          reportId: state.session.reportId,
          error: message,
          reason,
          note: 'Rate limit or network error - update will be retried on next change',
        })
        
        // Don't set error state for non-critical errors - just mark as not saving
        set({
          isSaving: false,
          error: null, // Don't show error for transient issues
        })
        return // Exit early - don't show error UI
      }

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
   * ✅ TWIN ENGINE: Delegates to engine
   */
  clearSession: () => {
    const state = get()

    storeLogger.info('[Session] Clearing session', {
      reportId: state.session?.reportId,
    })

    // Delegate to engine
    if (state.engine) {
      state.engine.clearSession()
    }

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
   * ✅ TWIN ENGINE: Delegates to engine
   */
  getReportId: () => {
    const state = get()
    if (state.engine) {
      return state.engine.getReportId()
    }
    return state.session?.reportId || null
  },

  /**
   * Get session data
   * ✅ TWIN ENGINE: Delegates to engine
   */
  getSessionData: () => {
    const state = get()
    if (state.engine) {
      return state.engine.getSessionData()
    }
    return state.session?.sessionData || null
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
