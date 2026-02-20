/**
 * Unified Session Store
 *
 * Bank-grade state machine architecture for session management.
 * Uses explicit states: IDLE -> LOADING -> LOADED | ERROR
 *
 * Key Features:
 * - Explicit state machine (no boolean flags)
 * - Promise cache prevents duplicate loads
 * - Atomic state updates
 * - Simple API (loadSession, updateSession, clearSession)
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
import { SessionRestorationService } from '../services/session/SessionRestorationService'

/**
 * Explicit session states (bank-grade state machine)
 */
export type SessionStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface SessionStore {
  // Core state (explicit state machine)
  session: ValuationSession | null
  status: SessionStatus
  errorMessage: string | null

  // Computed properties for backward compatibility
  isLoading: boolean
  error: string | null
  isInitializing: boolean

  // Save state (M&A workflow)
  isSaving: boolean
  lastSaved: Date | null
  hasUnsavedChanges: boolean

  // Restoration progress tracking
  restorationProgress: RestorationProgress | null

  // Callbacks
  onSaveSuccess?: () => void
  onAssetSaveSuccess?: () => void

  // Paywall state
  paywallData: {
    current: number
    limit: number
    message: string
  } | null

  // Engine instance
  engine: ISessionEngine | null

  // Actions
  setEngine: (identity: IdentityState) => void
  loadSession: (
    reportId: string,
    flow?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ) => Promise<void>
  updateSession: (updates: Partial<ValuationSession>) => void
  updateSessionData: (data: Partial<any>) => Promise<void>
  saveSession: (reason?: 'user' | 'autosave' | 'system') => Promise<void>
  clearSession: () => void
  completeInitialization: () => void

  // Paywall actions
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
 * Uses explicit state machine for predictable behavior.
 */
export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state (explicit state machine)
  session: null,
  status: 'idle' as SessionStatus,
  errorMessage: null,
  
  // Computed properties for backward compatibility
  get isLoading() { return get().status === 'loading' },
  get error() { return get().errorMessage },
  get isInitializing() { return get().status === 'idle' || get().status === 'loading' },
  
  // Save state
  isSaving: false,
  lastSaved: null,
  hasUnsavedChanges: false,
  
  // Other state
  restorationProgress: null,
  paywallData: null,
  engine: null,
  onSaveSuccess: undefined,
  onAssetSaveSuccess: undefined,

  /**
   * Set engine based on identity
   * Called from BootstrapProvider when identity is resolved
   */
  setEngine: (identity: IdentityState) => {
    const engine = createSessionEngine(identity)
    set({ engine })
    storeLogger.debug('[Session] Engine set', {
      identityType: identity.type,
      engineType: 'AuthenticatedSessionEngine',
    })
  },

  /**
   * Load session from backend/cache
   *
   * State Machine Transitions:
   * - IDLE/ERROR -> LOADING -> LOADED (success) or ERROR (failure)
   * - Promise cache prevents duplicate concurrent loads
   * 
   * Session Types:
   * - NEW SESSION: No existing data, show "Initializing" state
   * - EXISTING SESSION: Has data, show "Restoring" state, hydrate all stores
   */
  loadSession: async (
    reportId: string,
    flow?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ) => {
    const state = get()

    // STATE CHECK: Already loaded for this reportId
    if (state.status === 'loaded' && state.session?.reportId === reportId) {
      storeLogger.debug('[Session] Already loaded, skipping', { reportId })
      return
    }

    // PROMISE CACHE: Reuse existing load promise
    if (loadingPromises.has(reportId)) {
      storeLogger.debug('[Session] Reusing existing load promise', { reportId })
      await loadingPromises.get(reportId)
      return
    }

    // STATE TRANSITION: -> LOADING
    const loadPromise = (async () => {
      set({ 
        status: 'loading' as SessionStatus, 
        errorMessage: null,
        session: state.session?.reportId !== reportId ? null : state.session,
      })

      try {
        storeLogger.debug('[Session] Loading session', { reportId, flow })

        const currentState = get()
        if (!currentState.engine) {
          throw new Error('Session engine not initialized. Call setEngine() first.')
        }
        
        const session = await currentState.engine.loadSession(reportId, flow, prefilledQuery)

        if (!session) {
          throw new Error(`Session not found: ${reportId}`)
        }
        
        // ✅ WORLD-CLASS: Detect new vs existing session
        // Cast to any since backend sessionData can have various shapes (snake_case, camelCase, nested)
        // ✅ BANK-GRADE FIX: Check ALL possible locations for valuation result
        const sessionData = (session.sessionData || {}) as any
        const sessionAny = session as any
        const hasExistingValuationResult = !!(
          // Top-level fields (from mergeSessionFields)
          sessionAny.valuationResult ||
          sessionAny.htmlReport ||
          // sessionData fields (snake_case and camelCase)
          sessionData.valuationResult || 
          sessionData.valuation_result ||
          sessionData.htmlReport ||
          sessionData.html_report ||
          sessionData._valuationResult ||
          sessionData._htmlReport ||
          // Legacy fields
          sessionAny.latestValuation ||
          sessionAny.latest_valuation
        )
        // CRITICAL: Broaden check to include KBO and other form fields from Mercury
        // Empty company_name is falsy but kbo_number, vat_number, etc. may exist
        const hasExistingFormData = !!(
          sessionData.formData ||
          sessionData.form_data ||
          (sessionData.companyName && sessionData.companyName.trim() !== '') ||
          (sessionData.company_name && sessionData.company_name.trim() !== '') ||
          sessionData.kboNumber ||
          sessionData.kbo_number ||
          sessionData.vatNumber ||
          sessionData.vat_number ||
          sessionData.businessTypeId ||
          sessionData.business_type_id ||
          sessionData.revenue ||
          sessionData.ebitda ||
          sessionData.foundingYear ||
          sessionData.founding_year ||
          (sessionData.postalCode && sessionData.postalCode.trim() !== '') ||
          (sessionData.postal_code && sessionData.postal_code.trim() !== '') ||
          (sessionData.legalForm && sessionData.legalForm.trim() !== '') ||
          (sessionData.legal_form && sessionData.legal_form.trim() !== '') ||
          sessionData.naceCode ||
          sessionData.nace_code
        )
        const isExistingSession = hasExistingValuationResult || hasExistingFormData

        // STATE TRANSITION: -> LOADED
        // DIAGNOSTIC: Log sessionData for Mercury data flow tracing
        const sessionDataForLog = (session.sessionData || {}) as Record<string, unknown>;
        storeLogger.info('[Session] Loaded successfully', {
          reportId: session.reportId?.substring(0, 20),
          hasSessionData: !!session.sessionData,
          isExistingSession,
          hasExistingValuationResult,
          hasExistingFormData,
          sessionDataKboFields: {
            company_name: !!sessionDataForLog.company_name,
            kbo_number: !!sessionDataForLog.kbo_number,
            vat_number: !!sessionDataForLog.vat_number,
          },
        })
        
        // ✅ WORLD-CLASS: Trigger centralized restoration
        // For EXISTING sessions: Hydrate ALL stores (form, results, versions, normalizations)
        // For NEW sessions: Skip restoration (nothing to restore)
        // BANK-GRADE: Clear prior restoration so full API session wins over bootstrap/minimal.
        // Bootstrap may have triggered restore(minimalSession); loadSession has authoritative data.
        if (isExistingSession) {
          storeLogger.debug('[Session] Existing session detected - triggering full restoration', { reportId })
          SessionRestorationService.clearRestorationState(session.reportId)
          const restorationResult = await SessionRestorationService.restore(session.reportId, session)
          
          storeLogger.debug('[Session] Restoration complete', {
            reportId: session.reportId,
            success: restorationResult.success,
            restoredFormFields: restorationResult.restoredFormFields,
            restoredValuationResult: restorationResult.restoredValuationResult,
            restoredHtmlReport: restorationResult.restoredHtmlReport,
            restoredVersionHistory: restorationResult.restoredVersionHistory,
            restoredEbitdaNormalizations: restorationResult.restoredEbitdaNormalizations,
          })
        } else {
          storeLogger.debug('[Session] New session detected - skipping restoration', { reportId })
        }
        
        set({
          session,
          status: 'loaded' as SessionStatus,
          errorMessage: null,
          hasUnsavedChanges: false,
          lastSaved: session.updatedAt || null,
          isSaving: false,
        })
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Failed to load session'

        // Handle paywall errors separately
        const isPaywallError = (error as any).isPaywallError === true

        if (isPaywallError) {
          storeLogger.info('[Session] Load blocked by paywall', { reportId })
          set({
            status: 'idle' as SessionStatus,
            errorMessage: null,
            paywallData: {
              current: (error as any).current || 0,
              limit: (error as any).limit || 1,
              message: rawMessage,
            },
          })
          return
        }

        // STATE TRANSITION: -> ERROR
        storeLogger.error('[Session] Load failed', { reportId, error: rawMessage })
        set({
          status: 'error' as SessionStatus,
          errorMessage: rawMessage,
        })

        // Handle 404 - redirect if on report page
        const statusCode = (error as any).response?.status || (error as any).status
        if (statusCode === 404 && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath.includes('/reports/')) {
            const localeMatch = currentPath.match(/^\/(en|nl)/)
            const locale = localeMatch ? localeMatch[1] : 'en'
            window.location.href = `/${locale}`
            return
          }
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
      status: 'idle' as SessionStatus,
      errorMessage: null,
      isSaving: false,
      lastSaved: null,
      hasUnsavedChanges: false,
    })
  },

  /**
   * Mark initialization as complete (transition to loaded state)
   * 
   * For new reports from bootstrap: session is created by useBootstrapSync
   * before this is called. For bootstrapHasNewReport (ValuationSessionManager
   * skips loadSession): we rely on useBootstrapSync to create session and
   * call this, so session will exist.
   * 
   * When session is null (e.g. bootstrap failed or sync not yet run):
   * set status='loaded' anyway to unblock UI - prevents infinite loading
   * when bootstrap provides new report but sync hasn't run yet.
   */
  completeInitialization: () => {
    const state = get()
    set({ status: 'loaded' as SessionStatus })
    storeLogger.debug('[Session] Initialization complete', {
      hasSession: !!state.session,
      reportId: state.session?.reportId?.substring(0, 20) || 'none',
    })
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
