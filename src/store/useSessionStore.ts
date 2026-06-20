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
import {
  type DelegatedMercuryHandoffSignals,
  isDelegatedMercuryAccountantHandoff,
} from '../lib/mercury/sessionReadiness'
import type { ISessionEngine, SessionDataRecord } from '../services/session/SessionEngine'
import { createSessionEngine } from '../services/session/SessionEngineFactory'
import type { ValuationSession } from '../types/valuation'
import { storeLogger } from '../utils/logger'
import {
  asSessionDataRecord,
  buildNoEngineHydratedSession,
  isNonCriticalSaveFailureMessage,
  normalizeHydrateUpdatesRemovingOptimisticShell,
  preserveRecoveredHtmlOnSessionCommit,
  readString,
  scheduleOptionalGapFillAfterHydrate,
  sessionHydrateUpdatesAreNoop,
  stripOptimisticShellFromSession,
} from './useSessionStore.helpers'
import { createLoadSessionAction, invalidateActiveLoads } from './useSessionStore.loadSession'

// Source-contract sentinel: "loadSession blocked — engine not initialized" is enforced
// in `useSessionStore.loadSession.ts`, while this shell preserves the public store boundary.

/**
 * Explicit session states (bank-grade state machine)
 */
export type SessionStatus = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * Non-recoverable render failures surfaced from Titan via ensure-html.
 * `payload_too_large` is the only known case today: the valuation completed
 * but ValuationIQ's /reports/render rejected the payload as >25MB. Marking
 * it on the session store lets the report viewer show a specific message
 * instead of the generic "report not available" fallback.
 */
export type SessionRenderError = 'payload_too_large' | 'html_recovery_failed'

export interface SessionStore {
  // Core state (explicit state machine)
  session: ValuationSession | null
  status: SessionStatus
  errorMessage: string | null
  renderError: SessionRenderError | null

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
  setRenderError: (renderError: SessionRenderError | null) => void
  setEngine: (identity: IdentityState) => void
  cancelActiveLoad: (reportId?: string) => void
  loadSession: (
    reportId: string,
    flow?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ) => Promise<void>
  updateSession: (updates: Partial<ValuationSession>) => void
  hydrateSession: (updates: Partial<ValuationSession>) => void
  updateSessionData: (data: Partial<SessionDataRecord>) => Promise<void>
  saveSession: (reason?: 'user' | 'autosave' | 'system') => Promise<void>
  clearSession: () => void
  completeInitialization: () => void
  /**
   * Atomic seed used by the Mercury optimistic shell.
   *
   * Replaces the prior three-call sequence (`hydrateSession` →
   * `setEngine` → `completeInitialization`) which fired three separate
   * Zustand notifications during the bootstrap in-flight window. With
   * many subscribers below ManualLayout (form/store hooks, session
   * panels, Radix-driven UI), three back-to-back commits compounded
   * with composeRefs / context Provider churn into the React #185
   * "Maximum update depth exceeded" cascade traced in the accountant
   * existing-report flow on 2026-05-26.
   *
   * One `set()` collapses the cascade to a single notification cycle.
   */
  seedOptimisticMercuryShell: (params: {
    seedSession: Partial<ValuationSession> & { reportId: string }
    identity: IdentityState
    /** When set, refuses seed for advisor delegated handoffs (defense in depth). */
    delegatedHandoffSignals?: DelegatedMercuryHandoffSignals
  }) => void
  /**
   * Atomic hydrate that also advances `status` to `'loaded'` in the same
   * Zustand `set()`. Used by `useBootstrapSync` after Titan returns the
   * existing-report payload so subscribers see the new session + the
   * status flip as a single commit instead of two (`hydrateSession`
   * notification → `completeInitialization` notification).
   *
   * The two-call form was the second source of React #185 cascades in
   * the same Mercury accountant flow — separate from (but symmetric to)
   * the optimistic-shell seed cascade fixed by `seedOptimisticMercuryShell`.
   * `errorMessage` and `renderError` are cleared as part of the same
   * commit so the loaded state is internally consistent.
   */
  hydrateSessionAndComplete: (updates: Partial<ValuationSession>) => void

  // Restoration actions
  setRestorationComplete: (value: boolean) => void

  // Paywall actions
  clearPaywall: () => void

  // Helpers
  getReportId: () => string | null
  getSessionData: () => SessionDataRecord | null
  markSaved: (expectedDirtyVersion?: number) => void
  markUnsaved: () => void
}

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
  renderError: null,

  setRenderError: (renderError: SessionRenderError | null) => set({ renderError }),

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
    const existingSession = get().session

    if (existingSession) {
      engine.hydrateSession(existingSession)
    }

    set({ engine })
    storeLogger.debug('[Session] Engine set', {
      identityType: identity.type,
      engineType: 'AuthenticatedSessionEngine',
      hydratedExistingSession: !!existingSession,
    })
  },

  cancelActiveLoad: (reportId?: string) => {
    invalidateActiveLoads(reportId)
    storeLogger.debug('[Session] Active load invalidated', { reportId })
  },

  seedOptimisticMercuryShell: ({ seedSession, identity, delegatedHandoffSignals }) => {
    if (identity.type === 'accountant_for_client') {
      storeLogger.warn(
        '[Session] Refusing optimistic Mercury shell for accountant_for_client — bootstrap owns delegated handoffs',
        { reportId: seedSession.reportId.substring(0, 30) }
      )
      return
    }
    if (delegatedHandoffSignals && isDelegatedMercuryAccountantHandoff(delegatedHandoffSignals)) {
      storeLogger.warn('[Session] Refusing optimistic Mercury shell — delegated handoff signals', {
        reportId: seedSession.reportId.substring(0, 30),
      })
      return
    }

    const engine = createSessionEngine(identity)
    const now = seedSession.updatedAt || seedSession.createdAt || new Date()
    const builtSession: ValuationSession = {
      reportId: seedSession.reportId,
      currentView: seedSession.currentView || 'manual',
      dataSource: seedSession.dataSource || 'manual',
      createdAt: seedSession.createdAt || now,
      updatedAt: now,
      sessionData: seedSession.sessionData || {},
      partialData: seedSession.partialData || {},
      ...(seedSession.status && { status: seedSession.status }),
      ...(seedSession.reportReady !== undefined && { reportReady: seedSession.reportReady }),
      ...(seedSession.name && { name: seedSession.name }),
      ...(seedSession.valuationResult && { valuationResult: seedSession.valuationResult }),
      ...(seedSession.htmlReport && { htmlReport: seedSession.htmlReport }),
    } as ValuationSession

    // Hydrate the engine's internal copy BEFORE the single setState so it
    // matches the session we expose. `engine.hydrateSession` is a method
    // call, not a Zustand notification — it does not trigger subscriber
    // re-renders. The atomic `set()` below is the only React-visible commit.
    engine.hydrateSession(builtSession)

    set({
      session: builtSession,
      engine,
      status: 'loaded' as SessionStatus,
      errorMessage: null,
      renderError: null,
    })

    // `restorationComplete` stays false on the optimistic shell path so the
    // gap-fill helper bails (see `queueOptionalGapFillFlush`). The real
    // restoration sets it later via `setRestorationComplete(true)`.

    storeLogger.debug('[Session] Optimistic Mercury shell seeded atomically', {
      reportId: builtSession.reportId.substring(0, 30),
      identityType: identity.type,
    })
  },

  hydrateSessionAndComplete: (updates: Partial<ValuationSession>) => {
    const state = get()
    updates = normalizeHydrateUpdatesRemovingOptimisticShell(updates)

    // No-op short-circuit (React #185 hardening, 2026-05-27): the bootstrap
    // settling window calls this from useBootstrapSync.syncSession AND from
    // the optimistic Mercury shell path. When the second caller produces no
    // net change (same sessionData fields with same values, status already
    // 'loaded'), the prior code still spread-rebuilt `session` + emitted a
    // Zustand notification. Each notification fanned out across the
    // sessionData / session / status selectors and compounded with parallel
    // form-store writes into the React #185 cascade. We compare BEFORE the
    // `set()` so the cascade never starts.
    if (
      state.status === 'loaded' &&
      state.errorMessage === null &&
      state.renderError === null &&
      state.session &&
      sessionHydrateUpdatesAreNoop(state.session, updates)
    ) {
      storeLogger.debug('[Session] Hydrate+complete skipped — content unchanged', {
        reportId: state.session.reportId?.substring(0, 30),
      })
      return
    }

    // Build the next session the same way `hydrateSession` does so the
    // contract stays identical — but commit `status='loaded'` in the same
    // `set()` to remove the two-step ('session updated → status flipped')
    // window that subscribers used to observe and re-render against.
    if (!state.engine) {
      if (!updates.reportId && !state.session) {
        storeLogger.warn('[Session] Cannot hydrate+complete - engine and reportId both missing')
        // Still flip status='loaded' so the UI exits the skeleton; otherwise the
        // caller is stuck waiting on a payload that never arrives. Matches
        // `completeInitialization`'s tolerant contract.
        set({ status: 'loaded' as SessionStatus, errorMessage: null, renderError: null })
        return
      }

      set((current) => {
        const nextSession = buildNoEngineHydratedSession(current.session, updates)
        if (!nextSession) {
          return {
            session: current.session,
            status: 'loaded' as SessionStatus,
            errorMessage: null,
            renderError: null,
            hasUnsavedChanges: current.hasUnsavedChanges,
            dirtyVersion: current.dirtyVersion,
          }
        }

        return {
          session: nextSession,
          status: 'loaded' as SessionStatus,
          errorMessage: null,
          renderError: null,
          hasUnsavedChanges: current.hasUnsavedChanges,
          dirtyVersion: current.dirtyVersion,
        }
      })
      scheduleOptionalGapFillAfterHydrate()
      storeLogger.debug('[Session] Hydrated + completed atomically (no engine)', {
        reportId: updates.reportId?.substring(0, 30) ?? state.session?.reportId?.substring(0, 30),
      })
      return
    }

    const previousSession = state.session
    state.engine.hydrateSession(updates)

    const updatedSession = state.engine.getSession()
    if (updatedSession) {
      const sessionToCommit = preserveRecoveredHtmlOnSessionCommit(
        stripOptimisticShellFromSession(updatedSession),
        previousSession
      )
      set({
        session: sessionToCommit,
        status: 'loaded' as SessionStatus,
        errorMessage: null,
        renderError: null,
        hasUnsavedChanges: state.hasUnsavedChanges,
        dirtyVersion: state.dirtyVersion,
      })
      scheduleOptionalGapFillAfterHydrate()
      storeLogger.debug('[Session] Hydrated + completed atomically (with engine)', {
        reportId: sessionToCommit.reportId?.substring(0, 30),
      })
    } else {
      // Engine accepted the hydrate but returned no session — still flip
      // status='loaded' so the UI exits the skeleton. Symmetric with the
      // `completeInitialization` tolerance.
      set({ status: 'loaded' as SessionStatus, errorMessage: null, renderError: null })
    }
  },

  loadSession: createLoadSessionAction(set, get),

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
    updates = normalizeHydrateUpdatesRemovingOptimisticShell(updates)

    // No-op short-circuit (React #185 hardening, 2026-05-27): the gap-fill
    // path in useBootstrapSync.syncSession calls `hydrateSession` with the
    // exact prefill that was already merged into the optimistic Mercury
    // shell. Pre-fix this produced a fresh `session` reference + Zustand
    // notification for every prefill source even when the merged outcome
    // was bit-identical.
    if (state.session && sessionHydrateUpdatesAreNoop(state.session, updates)) {
      storeLogger.debug('[Session] Hydrate skipped — content unchanged', {
        reportId: state.session.reportId?.substring(0, 30),
      })
      return
    }

    if (!state.engine) {
      if (!updates.reportId && !state.session) {
        storeLogger.warn('[Session] Cannot hydrate - engine not initialized and no reportId')
        return
      }

      set((current) => {
        const nextSession = buildNoEngineHydratedSession(current.session, updates)
        if (!nextSession) {
          return {
            session: current.session,
            hasUnsavedChanges: current.hasUnsavedChanges,
            dirtyVersion: current.dirtyVersion,
          }
        }

        return {
          session: nextSession,
          hasUnsavedChanges: current.hasUnsavedChanges,
          dirtyVersion: current.dirtyVersion,
        }
      })
      scheduleOptionalGapFillAfterHydrate()
      return
    }

    const previousSession = state.session
    state.engine.hydrateSession(updates)

    const updatedSession = state.engine.getSession()
    if (updatedSession) {
      set({
        session: preserveRecoveredHtmlOnSessionCommit(
          stripOptimisticShellFromSession(updatedSession),
          previousSession
        ),
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
  updateSessionData: async (data: Partial<SessionDataRecord>) => {
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
      storeLogger.debug('[Session] Save already in progress, delegating to engine queue', {
        reason,
      })
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
        const savedSessionData = asSessionDataRecord(savedSession.sessionData)
        const savedCompanyName = readString(savedSessionData, 'company_name')
        const hasSavedCompanyName = savedCompanyName && savedCompanyName.trim() !== ''
        storeLogger.debug('[Session] Updating store with saved session', {
          reportId: state.session.reportId,
          hasSavedSession: !!savedSession,
          savedCompanyName,
          hasSavedCompanyName,
          savedBusinessTypeId: savedSessionData.business_type_id,
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
      const isNonCritical = isNonCriticalSaveFailureMessage(message)

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
    invalidateActiveLoads()

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
      renderError: null,
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
