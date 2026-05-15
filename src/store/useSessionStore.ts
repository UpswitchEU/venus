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
import type { IdentityState } from '../lib/bootstrap/types'
import { getSafeMercuryReturnUrl, isLegacyReturnUrl } from '../lib/return-url'
import type { ISessionEngine } from '../services/session/SessionEngine'
import { createSessionEngine } from '../services/session/SessionEngineFactory'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import type { ValuationSession } from '../types/valuation'
import { storeLogger } from '../utils/logger'
import { sessionEnvelopeHasIdentitySignals } from '../utils/mergeOptionalSessionPrefillFields'
import { getFirstRenderableReportHtml } from '../utils/safetyNetReportHtml'

/**
 * After session snapshot updates from {@link loadSession} or {@link hydrateSession}, Omni optional
 * fields (DCF/NAV/SaaS/multiples/fiscal) may still have empty slots the merge pass can fill.
 * Imported lazily so the store does not statically depend on merge hooks (those import this store).
 */
function scheduleOptionalGapFillAfterHydrate(): void {
  queueMicrotask(() => {
    void import('../hooks/sessionOptionalGapFillFlush').then(({ queueOptionalGapFillFlush }) => {
      queueOptionalGapFillFlush()
    })
  })
}

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
  dirtyVersion: number

  // Restoration progress tracking
  restorationProgress: RestorationProgress | null
  restorationComplete: boolean

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
  hydrateSession: (updates: Partial<ValuationSession>) => void
  updateSessionData: (data: Partial<any>) => Promise<void>
  saveSession: (reason?: 'user' | 'autosave' | 'system') => Promise<void>
  clearSession: () => void
  completeInitialization: () => void

  // Restoration actions
  setRestorationComplete: (value: boolean) => void

  // Paywall actions
  clearPaywall: () => void

  // Helpers
  getReportId: () => string | null
  getSessionData: () => any | null
  markSaved: (expectedDirtyVersion?: number) => void
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
  get isLoading() {
    return get().status === 'loading'
  },
  get error() {
    return get().errorMessage
  },
  get isInitializing() {
    return get().status === 'idle' || get().status === 'loading'
  },

  // Save state
  isSaving: false,
  lastSaved: null,
  hasUnsavedChanges: false,
  dirtyVersion: 0,

  // Other state
  restorationProgress: null,
  restorationComplete: false,
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

    // Detect "refresh" case: the bootstrap-minimal session is already in the
    // store (status='loaded', matching reportId, sessionData carries a
    // _bootstrapPrefill or _bootstrapCreated marker from useBootstrapSync).
    // The caller — typically ValuationSessionManager's needsFullLoad branch —
    // wants to fetch the full session payload (htmlReport, valuationResult,
    // full sessionData) without kicking the UI back to a skeleton. In this
    // mode we keep status='loaded' across the fetch and let the success
    // handler hydrate additional fields in place.
    //
    // IMPORTANT: check for the PRESENCE of the marker, not its truthy value.
    // useBootstrapSync.ts:761 writes `_bootstrapPrefill: hasPrefill` which is
    // legitimately `false` for empty existing drafts. If we checked `=== true`
    // we'd miss that case and the short-circuit below would prevent the full
    // refresh from ever running, leaving the user stuck on an empty wizard.
    const sessionMatches = state.session?.reportId === reportId
    const sessionData = (state.session?.sessionData ?? {}) as Record<string, unknown>
    const isBootstrapMinimal =
      sessionMatches &&
      state.status === 'loaded' &&
      ('_bootstrapPrefill' in sessionData || '_bootstrapCreated' in sessionData)

    // STATE CHECK: Already loaded for this reportId AND not a bootstrap-minimal
    // session. Bootstrap-minimal sessions intentionally fall through so we can
    // refresh the full payload from the backend.
    if (state.status === 'loaded' && sessionMatches && !isBootstrapMinimal) {
      storeLogger.debug('[Session] Already loaded, skipping', { reportId })
      return
    }

    // PROMISE CACHE: Reuse existing load promise
    if (loadingPromises.has(reportId)) {
      storeLogger.debug('[Session] Reusing existing load promise', { reportId })
      await loadingPromises.get(reportId)
      return
    }

    // STATE TRANSITION: -> LOADING (initial), or stay LOADED (refresh)
    const loadPromise = (async () => {
      if (isBootstrapMinimal) {
        // Background refresh: keep status='loaded' so the UI doesn't flash
        // back to skeleton. The bootstrap-minimal session is good enough to
        // render the wizard chrome; we're fetching the rest in the
        // background and will merge it in on success.
        storeLogger.debug('[Session] Bootstrap-minimal refresh — keeping status=loaded', {
          reportId,
        })
        set({
          errorMessage: null,
          // Keep session and restorationComplete as-is; the success path will
          // update them with the full server payload.
        })
      } else {
        set({
          status: 'loading' as SessionStatus,
          errorMessage: null,
          restorationComplete: false,
          session: state.session?.reportId !== reportId ? null : state.session,
        })
      }

      try {
        storeLogger.debug('[Session] Loading session', { reportId, flow })

        const currentState = get()
        if (!currentState.engine) {
          throw new Error('Session engine not initialized. Call setEngine() first.')
        }

        const loadedSession = await currentState.engine.loadSession(reportId, flow, prefilledQuery)

        if (!loadedSession) {
          throw new Error(`Session not found: ${reportId}`)
        }

        let session: ValuationSession = loadedSession
        const previousSessionData = state.session?.sessionData as
          | Record<string, unknown>
          | undefined
        const previousBuyerReadiness =
          state.session?.buyerReadiness ??
          (previousSessionData?._buyerReadiness as ValuationSession['buyerReadiness'] | undefined)

        // Defensive: ensure reportId matches the URL even if engine normalization
        // did not fire (e.g. guest engine or future engine variants).
        // Primary normalization lives in AuthenticatedSessionEngine.normalizeReportId().
        if (session.reportId !== reportId) {
          session = { ...session, reportId }
        }

        if (previousBuyerReadiness && !session.buyerReadiness) {
          session = {
            ...session,
            buyerReadiness: previousBuyerReadiness,
            sessionData: {
              ...(session.sessionData || {}),
              _buyerReadiness: previousBuyerReadiness,
            } as ValuationSession['sessionData'],
          }
        }

        // ✅ WORLD-CLASS: Detect new vs existing session
        // Cast to any since backend sessionData can have various shapes (snake_case, camelCase, nested)
        // ✅ BANK-GRADE FIX: Check ALL possible locations for valuation result
        const sessionData = (session.sessionData || {}) as any
        const sessionAny = session as any
        const hasExistingHtmlReport = !!getFirstRenderableReportHtml(
          sessionAny.htmlReport,
          sessionData.htmlReport,
          sessionData.html_report,
          sessionData._htmlReport
        )
        const hasExistingValuationResult = !!(
          // Top-level fields (from mergeSessionFields)
          (
            sessionAny.valuationResult ||
            hasExistingHtmlReport ||
            // sessionData fields (snake_case and camelCase)
            sessionData.valuationResult ||
            sessionData.valuation_result ||
            sessionData._valuationResult ||
            // Legacy fields
            sessionAny.latestValuation ||
            sessionAny.latest_valuation
          )
        )
        const hasMergedEnvelopeIdentity = sessionEnvelopeHasIdentitySignals(sessionData)
        // CRITICAL: Broaden check to include KBO and other form fields from Mercury
        // Empty company_name is falsy but kbo_number, vat_number, etc. may exist.
        // Hermes may stash identity-only payloads under `_businessInfo` without flat mirrors — mirror SessionNormalizer.
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
          sessionData.nace_code ||
          hasMergedEnvelopeIdentity
        )
        const isExistingSession = hasExistingValuationResult || hasExistingFormData

        // STATE TRANSITION: -> LOADED
        // DIAGNOSTIC: Log sessionData for Mercury data flow tracing
        const sessionDataForLog = (session.sessionData || {}) as Record<string, unknown>
        storeLogger.info('[Session] Loaded successfully', {
          reportId: session.reportId?.substring(0, 30),
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
          storeLogger.debug('[Session] Existing session detected - triggering full restoration', {
            reportId,
          })
          SessionRestorationService.clearRestorationState(session.reportId)
          const restorationResult = await SessionRestorationService.restore(
            session.reportId,
            session
          )

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
          set({ restorationComplete: true })
        }

        set({
          session,
          status: 'loaded' as SessionStatus,
          errorMessage: null,
          hasUnsavedChanges: false,
          dirtyVersion: 0,
          lastSaved: session.updatedAt || null,
          isSaving: false,
        })
        scheduleOptionalGapFillAfterHydrate()
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Failed to load session'

        // Handle paywall errors separately
        const isPaywallError = (error as any).isPaywallError === true

        if (isPaywallError) {
          storeLogger.info('[Session] Load blocked by paywall', { reportId })
          set({
            status: 'idle' as SessionStatus,
            errorMessage: null,
            restorationComplete: true,
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
          restorationComplete: true,
        })

        // Handle 404 - redirect if on report page (e.g. deleted session/concept)
        const statusCode = (error as any).response?.status || (error as any).status
        if (statusCode === 404 && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath.includes('/reports/')) {
            const localeMatch = currentPath.match(/^\/(en|nl|fr|de)/)
            const locale = localeMatch ? localeMatch[1] : 'en'
            // Accountant flow: redirect to return_url or Mercury dashboard (avoids stuck on deleted report)
            try {
              const returnUrl = sessionStorage.getItem('upswitch_return_url')
              const sourceApp = sessionStorage.getItem('upswitch_source')
              if (returnUrl && !isLegacyReturnUrl(returnUrl) && sourceApp?.includes('mercury')) {
                const targetUrl = getSafeMercuryReturnUrl(returnUrl, {
                  locale,
                  sourceApp,
                })
                window.location.href = targetUrl
                return
              }
            } catch {
              // Fall through to Venus home
            }
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
        dirtyVersion: state.dirtyVersion + 1,
      })
    }
  },

  hydrateSession: (updates: Partial<ValuationSession>) => {
    const state = get()

    if (!state.engine) {
      if (!updates.reportId && !state.session) {
        storeLogger.warn('[Session] Cannot hydrate - engine not initialized and no reportId')
        return
      }

      set((current) => {
        const reportId = updates.reportId ?? current.session?.reportId
        if (!reportId) {
          return {
            session: current.session,
            hasUnsavedChanges: current.hasUnsavedChanges,
            dirtyVersion: current.dirtyVersion,
          }
        }

        const nextSession = current.session
          ? {
              ...current.session,
              ...updates,
              sessionData: updates.sessionData
                ? {
                    ...(current.session?.sessionData || {}),
                    ...updates.sessionData,
                  }
                : current.session?.sessionData,
              partialData: updates.partialData
                ? {
                    ...(current.session?.partialData || {}),
                    ...updates.partialData,
                  }
                : current.session?.partialData,
            }
          : ({
              reportId,
              currentView: updates.currentView || 'manual',
              dataSource: updates.dataSource || 'manual',
              createdAt: updates.createdAt || new Date(),
              updatedAt: updates.updatedAt || updates.createdAt || new Date(),
              sessionData: updates.sessionData || {},
              partialData: updates.partialData || {},
              ...(updates.status && { status: updates.status }),
              ...(updates.reportReady !== undefined && { reportReady: updates.reportReady }),
              ...(updates.name && { name: updates.name }),
              ...(updates.valuationResult && { valuationResult: updates.valuationResult }),
              ...(updates.htmlReport && { htmlReport: updates.htmlReport }),
              ...(updates.buyerReadiness && { buyerReadiness: updates.buyerReadiness }),
            } as ValuationSession)

        return {
          session: nextSession,
          hasUnsavedChanges: current.hasUnsavedChanges,
          dirtyVersion: current.dirtyVersion,
        }
      })
      scheduleOptionalGapFillAfterHydrate()
      return
    }

    state.engine.hydrateSession(updates)

    const updatedSession = state.engine.getSession()
    if (updatedSession) {
      set({
        session: updatedSession,
        hasUnsavedChanges: state.hasUnsavedChanges,
        dirtyVersion: state.dirtyVersion,
      })
      scheduleOptionalGapFillAfterHydrate()
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
        dirtyVersion: state.dirtyVersion + 1,
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

    if (state.isSaving) {
      storeLogger.debug('[Session] Save already in progress, skipping', { reason })
      return
    }

    // ✅ FIX: Capture hasUnsavedChanges BEFORE save starts (for toast callback)
    // This ensures we know if there were actual changes, even if state changes during save
    const hadUnsavedChangesBeforeSave = state.hasUnsavedChanges
    const saveStartDirtyVersion = state.dirtyVersion

    set({ isSaving: true, errorMessage: null })

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
      const latestState = get()
      const hasNewLocalChanges = latestState.dirtyVersion !== saveStartDirtyVersion
      set({
        isSaving: false,
        hasUnsavedChanges: hasNewLocalChanges ? latestState.hasUnsavedChanges : false,
        lastSaved: new Date(),
        errorMessage: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save session'

      // ✅ WORLD-CLASS FIX: Don't crash UI for non-critical errors
      // Rate limits (429) and network errors are transient - don't show error screen
      const isRateLimit =
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests')
      const isNetworkError =
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('ECONNREFUSED')
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
          errorMessage: null, // Don't show error for transient issues
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
        errorMessage: message,
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
      dirtyVersion: 0,
      restorationComplete: false,
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
      reportId: state.session?.reportId?.substring(0, 30) || 'none',
    })
  },

  /**
   * Set restoration complete flag.
   * Called by SessionRestorationService after hydrateStores() finishes.
   * Resets to false when a new session loads or session is cleared.
   */
  setRestorationComplete: (value: boolean) => {
    set({ restorationComplete: value })
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
  markSaved: (expectedDirtyVersion?: number) => {
    set((current) => {
      const hasNewerChanges =
        expectedDirtyVersion !== undefined && current.dirtyVersion !== expectedDirtyVersion

      return {
        hasUnsavedChanges: hasNewerChanges ? current.hasUnsavedChanges : false,
        lastSaved: new Date(),
        isSaving: false,
        errorMessage: null,
        dirtyVersion: current.dirtyVersion,
      }
    })

    storeLogger.debug('[Session] Marked as saved')
  },

  /**
   * Mark session as having unsaved changes
   */
  markUnsaved: () => {
    set({
      hasUnsavedChanges: true,
      dirtyVersion: get().dirtyVersion + 1,
    })
  },
}))
