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
import { navigateToMercuryFromManualHandoff } from '../features/manual/utils/manualMercuryNavigate'
import type { RestorationProgress } from '../hooks/useRestorationProgress'
import type { IdentityState } from '../lib/bootstrap/types'
import {
  type DelegatedMercuryHandoffSignals,
  isDelegatedMercuryAccountantHandoff,
} from '../lib/mercury/sessionReadiness'
import { isLegacyReturnUrl } from '../lib/return-url'
import type { ISessionEngine, SessionDataRecord } from '../services/session/SessionEngine'
import { createSessionEngine } from '../services/session/SessionEngineFactory'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import type { ValuationSession } from '../types/valuation'
import { storeLogger } from '../utils/logger'
import { sessionEnvelopeHasIdentitySignals } from '../utils/mergeOptionalSessionPrefillFields'
import { preserveClientRecoveredHtmlWhenServerSessionStale } from '../utils/reportHtmlRecovery'
import { getFirstRenderableReportHtml } from '../utils/safetyNetReportHtml'
import { useManualResultsStore } from './manual/useManualResultsStore'

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
 * Top-level session fields safe to scalar-compare for the no-op check.
 * `sessionData` / `partialData` are handled separately (they shallow-merge
 * instead of replace), and extension fields (e.g. `pdfUrl`, used by
 * `BootstrapMinimalSession`) fall through to the conservative "treat as
 * change" path.
 */
const HYDRATE_SCALAR_KEYS: ReadonlySet<string> = new Set<string>([
  'reportId',
  'currentView',
  'dataSource',
  'createdAt',
  'updatedAt',
  'status',
  'reportReady',
  'name',
  'valuationResult',
  'htmlReport',
  'buyerReadiness',
])

function isNonCriticalSaveFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  const isHardAuthFailure =
    normalized.includes('authentication required') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('invalid authentication token')

  if (isHardAuthFailure && !normalized.includes('temporarily unavailable')) {
    return false
  }

  const retryableStatusMatch =
    normalized.match(/\b(?:status(?:\s+code)?|http)\s*:?\s*(408|429|499|5\d{2})\b/) ||
    normalized.match(
      /\b(408|429|499|5\d{2})\s+(?:request timeout|too many requests|client closed request|service unavailable|server error|internal server error|bad gateway|gateway timeout)\b/
    )
  if (retryableStatusMatch?.[1]) return true

  return (
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('network') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('aborted') ||
    normalized.includes('canceled') ||
    normalized.includes('cancelled') ||
    normalized.includes('econnrefused') ||
    normalized.includes('econnreset') ||
    normalized.includes('etimedout') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('service unavailable') ||
    normalized.includes('did not respond in time') ||
    normalized.includes('upstream_timeout') ||
    normalized.includes('server error') ||
    normalized.includes('bad gateway') ||
    normalized.includes('gateway timeout')
  )
}

/**
 * Cheap content check: would applying `updates` to `current` change anything
 * a subscriber could observe?
 *
 * Returns true ONLY when every requested top-level update already matches the
 * current value AND every key in `updates.sessionData` / `updates.partialData`
 * is already present on the current session with an `Object.is`-equal value.
 *
 * We deliberately keep this shallow on the merged subtrees — going deep would
 * be both slower and pointless: most prefill payloads target leaf scalars
 * (`company_name`, `kbo_number`, …) and same-leaf-same-value is the exact
 * case we want to filter out.
 */
function sessionHydrateUpdatesAreNoop(
  current: ValuationSession,
  updates: Partial<ValuationSession>
): boolean {
  const currentRecord = current as unknown as Record<string, unknown>
  const updatesRecord = updates as unknown as Record<string, unknown>
  for (const key of Object.keys(updatesRecord)) {
    if (key === 'sessionData' || key === 'partialData') continue
    if (HYDRATE_SCALAR_KEYS.has(key)) {
      if (!Object.is(currentRecord[key], updatesRecord[key])) {
        return false
      }
    } else {
      // Unknown / extension key — assume change to stay safe.
      return false
    }
  }
  const incomingSessionData = updates.sessionData
  if (incomingSessionData && typeof incomingSessionData === 'object') {
    const currentSessionData = (current.sessionData ?? {}) as Record<string, unknown>
    const incoming = incomingSessionData as Record<string, unknown>
    for (const k of Object.keys(incoming)) {
      if (!Object.is(currentSessionData[k], incoming[k])) {
        return false
      }
    }
  }
  const incomingPartialData = updates.partialData
  if (incomingPartialData && typeof incomingPartialData === 'object') {
    const currentPartialData = (current.partialData ?? {}) as Record<string, unknown>
    const incoming = incomingPartialData as Record<string, unknown>
    for (const k of Object.keys(incoming)) {
      if (!Object.is(currentPartialData[k], incoming[k])) {
        return false
      }
    }
  }
  return true
}

function sessionDataHasBootstrapMarker(data: Record<string, unknown>): boolean {
  return '_bootstrapPrefill' in data || '_bootstrapCreated' in data
}

/** Merge sessionData and drop the optimistic Mercury stub once bootstrap owns the snapshot. */
function mergeSessionDataStrippingOptimisticShell(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined
): ValuationSession['sessionData'] {
  const merged = { ...(current || {}), ...(incoming || {}) } as Record<string, unknown>
  if (sessionDataHasBootstrapMarker(merged)) {
    delete merged._optimisticMercuryShell
  }
  return merged as ValuationSession['sessionData']
}

function stripOptimisticShellFromSession(session: ValuationSession): ValuationSession {
  const sd = asSessionDataRecord(session.sessionData)
  if (!sessionDataHasBootstrapMarker(sd) || !('_optimisticMercuryShell' in sd)) {
    return session
  }
  const next = { ...sd }
  delete next._optimisticMercuryShell
  return { ...session, sessionData: next as ValuationSession['sessionData'] }
}

function preserveRecoveredHtmlOnSessionCommit(
  incoming: ValuationSession,
  previous: ValuationSession | null | undefined
): ValuationSession {
  return preserveClientRecoveredHtmlWhenServerSessionStale(
    incoming,
    previous,
    previous
      ? {
          htmlReport: useManualResultsStore.getState().htmlReport,
          valuationResult: useManualResultsStore.getState().result,
        }
      : undefined
  )
}

/** Drop the optimistic Mercury stub marker on incoming hydrate patches. */
function normalizeHydrateUpdatesRemovingOptimisticShell(
  updates: Partial<ValuationSession>
): Partial<ValuationSession> {
  const sd = updates.sessionData
  if (!sd || typeof sd !== 'object') return updates
  const record = sd as Record<string, unknown>
  if (!('_optimisticMercuryShell' in record) || !sessionDataHasBootstrapMarker(record)) {
    return updates
  }
  const next = { ...record }
  delete next._optimisticMercuryShell
  return { ...updates, sessionData: next as ValuationSession['sessionData'] }
}

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

interface SessionStore {
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

// Promise cache to prevent duplicate loads (Cursor pattern)
const loadingPromises = new Map<string, Promise<void>>()
let activeLoadSequence = 0

function invalidateActiveLoads(reportId?: string): void {
  activeLoadSequence += 1
  if (reportId) {
    loadingPromises.delete(reportId)
    return
  }
  loadingPromises.clear()
}

function asSessionDataRecord(data: unknown): SessionDataRecord {
  return data && typeof data === 'object' ? (data as SessionDataRecord) : {}
}

function readString(source: SessionDataRecord, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' ? value : null
}

function hasNonEmptyString(source: SessionDataRecord, key: string): boolean {
  return (readString(source, key)?.trim().length ?? 0) > 0
}

function readNumericLike(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const record = error as { response?: { status?: unknown }; status?: unknown }
  const nestedStatus = record.response?.status
  if (typeof nestedStatus === 'number') return nestedStatus
  return typeof record.status === 'number' ? record.status : null
}

function createSessionNotFoundError(reportId: string): Error & {
  response: { status: number }
  status: number
  statusCode: number
} {
  return Object.assign(new Error(`Session not found: ${reportId}`), {
    response: { status: 404 },
    status: 404,
    statusCode: 404,
  })
}

type PaywallLoadError = Error & {
  isPaywallError?: boolean
  current?: number
  limit?: number
}

const SESSION_NOT_READY_MESSAGE = 'Session not ready. Please wait for initialization or retry.'

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
        const reportId = updates.reportId ?? current.session?.reportId
        if (!reportId) {
          return {
            session: current.session,
            status: 'loaded' as SessionStatus,
            errorMessage: null,
            renderError: null,
            hasUnsavedChanges: current.hasUnsavedChanges,
            dirtyVersion: current.dirtyVersion,
          }
        }

        const nextSession = preserveRecoveredHtmlOnSessionCommit(
          current.session
            ? {
                ...current.session,
                ...updates,
                // Same reportId pin as the no-engine hydrateSession branch — see
                // that path for the rationale (canonical session_key drift).
                reportId: current.session.reportId,
                sessionData: updates.sessionData
                  ? mergeSessionDataStrippingOptimisticShell(
                      asSessionDataRecord(current.session?.sessionData),
                      asSessionDataRecord(updates.sessionData)
                    )
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
              } as ValuationSession),
          current.session
        )

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

    // Detect "refresh" case: a minimal renderable shell is already in the
    // store (status='loaded', matching reportId, sessionData carries a
    // bootstrap or optimistic Mercury marker).
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
    const sessionData = asSessionDataRecord(state.session?.sessionData)
    const isBootstrapMinimal =
      sessionMatches &&
      state.status === 'loaded' &&
      ('_bootstrapPrefill' in sessionData ||
        '_bootstrapCreated' in sessionData ||
        '_optimisticMercuryShell' in sessionData)

    // STATE CHECK: Already loaded for this reportId AND not a bootstrap-minimal
    // session. Bootstrap-minimal sessions intentionally fall through so we can
    // refresh the full payload from the backend.
    if (state.status === 'loaded' && sessionMatches && !isBootstrapMinimal) {
      storeLogger.debug('[Session] Already loaded, skipping', { reportId })
      return
    }

    // ENGINE GATE: Bootstrap must call setEngine before any load. Without this,
    // a race can flip status to 'loading' and surface "Session engine not initialized".
    if (!state.engine) {
      storeLogger.warn('[Session] loadSession blocked — engine not initialized', { reportId })
      throw new Error(SESSION_NOT_READY_MESSAGE)
    }

    // PROMISE CACHE: Reuse existing load promise
    if (loadingPromises.has(reportId)) {
      storeLogger.debug('[Session] Reusing existing load promise', { reportId })
      await loadingPromises.get(reportId)
      return
    }

    const loadToken = ++activeLoadSequence
    const isStaleLoad = () => loadToken !== activeLoadSequence
    const logStaleLoad = (phase: string) => {
      storeLogger.debug('[Session] Ignoring stale load completion', {
        reportId,
        phase,
      })
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
          renderError: null,
          // Keep session and restorationComplete as-is; the success path will
          // update them with the full server payload.
        })
      } else {
        set({
          status: 'loading' as SessionStatus,
          errorMessage: null,
          renderError: null,
          restorationComplete: false,
          session: state.session?.reportId !== reportId ? null : state.session,
        })
      }

      try {
        storeLogger.debug('[Session] Loading session', { reportId, flow })

        const currentState = get()
        if (!currentState.engine) {
          throw new Error(SESSION_NOT_READY_MESSAGE)
        }

        const loadedSession = await currentState.engine.loadSession(reportId, flow, prefilledQuery)

        if (isStaleLoad()) {
          logStaleLoad('engine-load')
          return
        }

        if (!loadedSession) {
          throw createSessionNotFoundError(reportId)
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

        session = preserveClientRecoveredHtmlWhenServerSessionStale(
          session,
          get().session ?? state.session,
          {
            htmlReport: useManualResultsStore.getState().htmlReport,
            valuationResult: useManualResultsStore.getState().result,
          }
        )

        // ✅ WORLD-CLASS: Detect new vs existing session
        // ✅ BANK-GRADE FIX: Check ALL possible locations for valuation result
        const sessionData = asSessionDataRecord(session.sessionData)
        const sessionRecord = session as ValuationSession & SessionDataRecord
        const hasExistingHtmlReport = !!getFirstRenderableReportHtml(
          session.htmlReport,
          readString(sessionData, 'htmlReport'),
          readString(sessionData, 'html_report'),
          readString(sessionData, '_htmlReport')
        )
        const hasExistingValuationResult = !!(
          // Top-level fields (from mergeSessionFields)
          (
            session.valuationResult ||
            hasExistingHtmlReport ||
            // sessionData fields (snake_case and camelCase)
            sessionData.valuationResult ||
            sessionData.valuation_result ||
            sessionData._valuationResult ||
            // Legacy fields
            sessionRecord.latestValuation ||
            sessionRecord.latest_valuation
          )
        )
        const hasMergedEnvelopeIdentity = sessionEnvelopeHasIdentitySignals(sessionData)
        // CRITICAL: Broaden check to include KBO and other form fields from Mercury
        // Empty company_name is falsy but kbo_number, vat_number, etc. may exist.
        // Hermes may stash identity-only payloads under `_businessInfo` without flat mirrors — mirror SessionNormalizer.
        const hasExistingFormData = !!(
          sessionData.formData ||
          sessionData.form_data ||
          hasNonEmptyString(sessionData, 'companyName') ||
          hasNonEmptyString(sessionData, 'company_name') ||
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
          hasNonEmptyString(sessionData, 'postalCode') ||
          hasNonEmptyString(sessionData, 'postal_code') ||
          hasNonEmptyString(sessionData, 'legalForm') ||
          hasNonEmptyString(sessionData, 'legal_form') ||
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

        if (isStaleLoad()) {
          logStaleLoad('pre-restoration')
          return
        }

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
            session,
            { shouldContinue: () => !isStaleLoad() }
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

        if (isStaleLoad()) {
          logStaleLoad('pre-commit')
          return
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
        if (isStaleLoad()) {
          logStaleLoad('error')
          return
        }

        const rawMessage = error instanceof Error ? error.message : 'Failed to load session'

        // Handle paywall errors separately
        const paywallError = error as PaywallLoadError
        const isPaywallError = paywallError.isPaywallError === true

        if (isPaywallError) {
          storeLogger.info('[Session] Load blocked by paywall', { reportId })
          set({
            status: 'idle' as SessionStatus,
            errorMessage: null,
            restorationComplete: true,
            paywallData: {
              current: readNumericLike(paywallError.current, 0),
              limit: readNumericLike(paywallError.limit, 1),
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
        const statusCode = readHttpStatus(error)
        if (statusCode === 404 && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath.includes('/reports/')) {
            const localeMatch = currentPath.match(/^\/(en|nl|fr)/)
            const locale = localeMatch ? localeMatch[1] : 'en'
            // Accountant flow: redirect to return_url or Mercury dashboard (avoids stuck on deleted report)
            try {
              const returnUrl = sessionStorage.getItem('upswitch_return_url')
              const sourceApp = sessionStorage.getItem('upswitch_source')
              if (returnUrl && !isLegacyReturnUrl(returnUrl) && sourceApp?.includes('mercury')) {
                navigateToMercuryFromManualHandoff({
                  currentLocale: locale,
                  hasCompletedValuation: false,
                })
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
      // Clean up only the promise that is finishing. A timeout/retry can
      // invalidate this entry and start a newer same-report load before this
      // finally block runs.
      if (loadingPromises.get(reportId) === loadPromise) {
        loadingPromises.delete(reportId)
      }
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
        const reportId = updates.reportId ?? current.session?.reportId
        if (!reportId) {
          return {
            session: current.session,
            hasUnsavedChanges: current.hasUnsavedChanges,
            dirtyVersion: current.dirtyVersion,
          }
        }

        const nextSession = preserveRecoveredHtmlOnSessionCommit(
          current.session
            ? {
                ...current.session,
                ...updates,
                // Mirror AuthenticatedSessionEngine.normalizeReportId(): once a
                // session has been bound to a reportId we never let a hydrate
                // payload silently drift it (e.g. SessionBackgroundRevalidation
                // shipping the canonical session_key when the page is on the
                // URL UUID). The engine path enforces this via requestedReportId;
                // the no-engine fallback enforces it by pinning to the established
                // current.session.reportId.
                reportId: current.session.reportId,
                sessionData: updates.sessionData
                  ? mergeSessionDataStrippingOptimisticShell(
                      asSessionDataRecord(current.session?.sessionData),
                      asSessionDataRecord(updates.sessionData)
                    )
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
              } as ValuationSession),
          current.session
        )

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
