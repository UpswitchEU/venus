/**
 * Authenticated Session Engine
 *
 * AUTH-FIRST Architecture: The only session engine used.
 * All users must authenticate before accessing session features.
 *
 * Features:
 * - Backend session persistence via Titan API
 * - Auto-save on changes
 * - Versions support
 * - Accountant-for-client workflows (session owned by client)
 * - Data prefill from KBO, user profile, and existing sessions
 *
 * Supported Identity Types:
 * - 'authenticated': Regular logged-in user owns the session
 * - 'accountant_for_client': Client owns session, accountant acts on behalf
 *
 * @module services/session/engines/AuthenticatedSessionEngine
 */

import { awaitSessionPoolPressureGate } from '../../../hooks/sessionPoolPressureCircuit'
import type { ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { preserveClientRecoveredHtmlWhenServerSessionStale } from '../../../utils/reportHtmlRecovery'
import { sessionService } from '../../index'
import type { FlowType, ISessionEngine, SessionDataRecord } from '../SessionEngine'
import {
  type AuthenticatedSessionSaveReason,
  classifySessionSaveQueueRequest,
  isActiveSessionLoad,
  isActiveSessionSaveQueue,
  shouldQueueUpdateForActiveLoad,
  shouldRunFollowUpSave,
} from './AuthenticatedSessionConcurrencyModel'
import { executeAuthenticatedSessionSave } from './AuthenticatedSessionSaveExecutor'
import {
  createAuthenticatedSessionFromUpdate,
  mergeAuthenticatedSessionUpdate,
  normalizeAuthenticatedSessionReportId,
} from './AuthenticatedSessionState'

const AUTOSAVE_SETTLE_MS = 750

/**
 * Authenticated Session Engine
 *
 * Full backend integration - wraps existing SessionService
 *
 * Coordinates backend loads, local updates, and serialized saves.
 * Updates that arrive during a current load are queued and only applied if that
 * load still owns the active report when it resolves.
 */
export class AuthenticatedSessionEngine implements ISessionEngine {
  private currentSession: ValuationSession | null = null
  private loadingPromise: Promise<ValuationSession | null> | null = null
  private loadingReportId: string | null = null
  private loadSequence = 0
  private pendingUpdates: Partial<ValuationSession>[] = []
  private localMutationVersion = 0

  // The reportId originally requested (from URL). The API may return a different
  // format (session_key like "val_xxx" instead of the UUID used in Mercury URLs).
  // We always normalize this.currentSession.reportId back to the requested value
  // so the Zustand store's stage check (session.reportId === reportId) never fails.
  private requestedReportId: string | null = null
  private sessionLifecycleVersion = 0

  // Multiple hooks can request persistence at once; serialize writes per active
  // report and collapse mid-flight callers into one follow-up save.
  private savePromise: Promise<void> | null = null
  private saveReportId: string | null = null
  private saveLifecycleVersion = 0
  private savePending: boolean = false
  private lastPersistedSaveFingerprint: string | null = null

  /**
   * Load session from backend
   */
  async loadSession(
    reportId: string,
    flow: FlowType = 'manual',
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null> {
    if (this.loadingPromise && this.loadingReportId === reportId) {
      generalLogger.debug('[AuthenticatedSessionEngine] Reusing in-flight load', {
        reportId,
      })
      return this.loadingPromise
    }

    if (this.loadingPromise && this.loadingReportId !== reportId) {
      generalLogger.warn('[AuthenticatedSessionEngine] Superseding in-flight load', {
        previousReportId: this.loadingReportId,
        nextReportId: reportId,
        droppedPendingUpdates: this.pendingUpdates.length,
      })
      this.pendingUpdates = []
    }

    // Track that we're loading this reportId
    const loadToken = ++this.loadSequence
    this.loadingReportId = reportId
    const loadPromise = this.performLoadSession(reportId, flow, prefilledQuery, loadToken)
    this.loadingPromise = loadPromise
    return loadPromise
  }

  private async performLoadSession(
    reportId: string,
    flow: FlowType,
    prefilledQuery: string | null | undefined,
    loadToken: number
  ): Promise<ValuationSession | null> {
    try {
      const session = await sessionService.loadSession(reportId, flow, prefilledQuery)
      if (!this.isActiveLoad(loadToken, reportId)) {
        generalLogger.debug('[AuthenticatedSessionEngine] Ignoring stale load response', {
          reportId,
          activeReportId: this.loadingReportId,
        })
        return null
      }

      if (session) {
        this.currentSession = session
        this.requestedReportId = reportId
        this.normalizeReportId()

        generalLogger.debug('[AuthenticatedSessionEngine] Loaded session from backend', {
          reportId,
          hasData: !!session.sessionData,
          hasHtmlReport: !!session.htmlReport,
          pendingUpdatesCount: this.pendingUpdates.length,
        })

        // Apply any pending updates that came in while loading
        if (this.pendingUpdates.length > 0) {
          generalLogger.debug('[AuthenticatedSessionEngine] Applying pending updates', {
            count: this.pendingUpdates.length,
          })
          for (const update of this.pendingUpdates) {
            this.applyUpdate(update)
          }
          this.pendingUpdates = []
        }
      }

      return this.currentSession
    } catch (error) {
      if (!this.isActiveLoad(loadToken, reportId)) {
        generalLogger.debug('[AuthenticatedSessionEngine] Ignoring stale load failure', {
          reportId,
          activeReportId: this.loadingReportId,
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }

      this.pendingUpdates = []
      generalLogger.error('[AuthenticatedSessionEngine] Failed to load session', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      if (this.isActiveLoad(loadToken, reportId)) {
        this.loadingPromise = null
        this.loadingReportId = null
      }
    }
  }

  private isActiveLoad(loadToken: number, reportId: string): boolean {
    return isActiveSessionLoad({
      loadToken,
      activeLoadSequence: this.loadSequence,
      reportId,
      loadingReportId: this.loadingReportId,
    })
  }

  /**
   * Apply update to current session (internal helper)
   */
  private applyUpdate(updates: Partial<ValuationSession>): void {
    if (!this.currentSession) return

    this.currentSession = mergeAuthenticatedSessionUpdate(this.currentSession, updates, new Date())
    this.localMutationVersion += 1
  }

  hydrateSession(updates: Partial<ValuationSession>): void {
    if (!this.currentSession) {
      const initialSession = createAuthenticatedSessionFromUpdate(
        updates,
        updates.updatedAt || updates.createdAt || new Date()
      )
      if (!initialSession) {
        generalLogger.debug(
          '[AuthenticatedSessionEngine] Skipping hydrate - no current session and no reportId'
        )
        return
      }

      this.currentSession = initialSession
      this.requestedReportId = initialSession.reportId
      this.normalizeReportId()
      return
    }

    const previousUpdatedAt = this.currentSession.updatedAt
    const previousSession = this.currentSession
    this.applyUpdate(updates)
    if (this.currentSession) {
      this.currentSession.updatedAt = updates.updatedAt || previousUpdatedAt || new Date()
      this.currentSession = preserveClientRecoveredHtmlWhenServerSessionStale(
        this.currentSession,
        previousSession
      )
    }
    // SessionBackgroundRevalidation hydrates with the canonical session_key when
    // Titan resolves a URL-UUID lookup to a row keyed on val_*. Without snapping
    // back to requestedReportId, session.reportId drifts away from the URL and
    // ValuationSessionManager's `session.reportId === reportId` gate gets stuck
    // on 'loading' for 30s before the safety-timer surfaces a session-timeout.
    this.normalizeReportId()
  }

  /**
   * Update session (backend + local state)
   *
   * Handles bootstrap initialization when no loadSession call was needed, and
   * queues local updates while an active load is still resolving.
   */
  updateSession(updates: Partial<ValuationSession>): void {
    if (
      shouldQueueUpdateForActiveLoad({
        isLoading: !!this.loadingPromise,
        loadingReportId: this.loadingReportId,
        currentReportId: this.currentSession?.reportId ?? null,
      })
    ) {
      generalLogger.debug('[AuthenticatedSessionEngine] Queueing update during load', {
        loadingReportId: this.loadingReportId?.substring(0, 30),
        currentReportId: this.currentSession?.reportId,
        updateKeys: Object.keys(updates),
      })
      this.pendingUpdates.push(updates)
      return
    }

    // Handle case where session is being set for the first time (bootstrap flow)
    if (!this.currentSession) {
      const initialSession = createAuthenticatedSessionFromUpdate(updates, new Date())
      if (initialSession) {
        // Bootstrap is setting initial session - accept it
        this.currentSession = initialSession
        // Mirror loadSession + hydrateSession's no-current-session branch: any
        // path that mints currentSession also pins requestedReportId so the
        // normalizeReportId() guards on every later mutation have something to
        // pin against. Without this, a subsequent updater can still drift the
        // session id away from the URL.
        this.requestedReportId = initialSession.reportId
        this.normalizeReportId()

        generalLogger.debug(
          '[AuthenticatedSessionEngine] Session initialized from updates (bootstrap flow)',
          {
            reportId: initialSession.reportId,
            hasSessionData: !!updates.sessionData,
          }
        )
        return
      }

      // (e.g., prefill trying to update before session is ready)
      generalLogger.debug(
        '[AuthenticatedSessionEngine] Skipping update - no current session and no reportId in updates',
        {
          updateKeys: Object.keys(updates),
          isLoading: !!this.loadingPromise,
        }
      )
      return
    }

    // Apply update to current session
    this.applyUpdate(updates)
    // Same reasoning as hydrateSession: keep currentSession.reportId pinned to
    // requestedReportId so SessionManager's equality gate never trips when an
    // updater happens to ship the backend's canonical session_key.
    this.normalizeReportId()

    generalLogger.debug('[AuthenticatedSessionEngine] Updated session (local)', {
      reportId: this.currentSession.reportId,
      updateKeys: Object.keys(updates),
    })

    // Backend persistence happens via saveSession (auto-save or manual)
  }

  /**
   * Save session to backend
   *
   * Waits for a pending load when needed, then serializes saves for the active
   * report. A stale save queue from a previous report or lifecycle is ignored.
   */
  async saveSession(reason: AuthenticatedSessionSaveReason = 'autosave'): Promise<void> {
    // If we're loading, wait for it to complete first
    if (this.loadingPromise) {
      generalLogger.debug('[AuthenticatedSessionEngine] Waiting for load to complete before saving')
      await this.loadingPromise
    }

    if (!this.currentSession) {
      generalLogger.debug('[AuthenticatedSessionEngine] Skipping save - no current session', {
        reason,
      })
      return
    }

    const activeReportId = this.currentSession.reportId
    const activeLifecycleVersion = this.sessionLifecycleVersion

    // Single drain promise per active report: all same-report callers await the
    // same queue. If teardown or navigation detached the old queue, this save
    // starts a fresh one for the current session.
    if (this.savePromise) {
      const queueDisposition = classifySessionSaveQueueRequest({
        hasSavePromise: true,
        saveReportId: this.saveReportId,
        saveLifecycleVersion: this.saveLifecycleVersion,
        activeReportId,
        activeLifecycleVersion,
      })

      if (queueDisposition === 'join') {
        this.savePending = true
        generalLogger.debug('[AuthenticatedSessionEngine] Save already in progress, queuing', {
          reportId: this.currentSession.reportId,
          reason,
        })
        await this.savePromise
        return
      }

      generalLogger.debug('[AuthenticatedSessionEngine] Detaching stale save queue', {
        staleReportId: this.saveReportId,
        activeReportId,
        reason,
      })
      this.savePending = false
    }

    const saveReportId = activeReportId
    const saveLifecycleVersion = activeLifecycleVersion
    const savePromise = this.drainSaveQueue(reason, saveReportId, saveLifecycleVersion)
    try {
      this.savePromise = savePromise
      this.saveReportId = saveReportId
      this.saveLifecycleVersion = saveLifecycleVersion
      await savePromise
    } finally {
      if (this.savePromise === savePromise) {
        this.savePromise = null
        this.saveReportId = null
        this.savePending = false
      }
    }
  }

  private async waitForAutosavePatchGate(): Promise<boolean> {
    return awaitSessionPoolPressureGate({
      shouldContinue: () => !!this.currentSession,
      onWait: (waitMs) => {
        generalLogger.debug('[AuthenticatedSessionEngine] Waiting for autosave patch gate', {
          reportId: this.currentSession?.reportId,
          waitMs,
        })
      },
    })
  }

  private isActiveSaveQueue(reportId: string, lifecycleVersion: number): boolean {
    return isActiveSessionSaveQueue({
      queueReportId: reportId,
      queueLifecycleVersion: lifecycleVersion,
      currentReportId: this.currentSession?.reportId ?? null,
      sessionLifecycleVersion: this.sessionLifecycleVersion,
    })
  }

  private async drainSaveQueue(
    reason: AuthenticatedSessionSaveReason,
    queueReportId: string,
    queueLifecycleVersion: number
  ): Promise<void> {
    let nextReason = reason

    do {
      if (!this.isActiveSaveQueue(queueReportId, queueLifecycleVersion)) {
        return
      }

      if (nextReason === 'autosave') {
        const ready = await this.waitForAutosavePatchGate()
        if (!ready) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_SETTLE_MS))
      }

      if (!this.isActiveSaveQueue(queueReportId, queueLifecycleVersion)) {
        return
      }

      // Absorb callers that arrived during the autosave settle window into the
      // single snapshot about to be sent. Mutations that happen while the HTTP
      // request is in-flight will flip savePending again and schedule one
      // follow-up pass below.
      this.savePending = false
      const savedMutationVersion = await this.executeSave(
        nextReason,
        queueReportId,
        queueLifecycleVersion
      )
      nextReason = 'autosave'

      if (!this.isActiveSaveQueue(queueReportId, queueLifecycleVersion)) {
        return
      }

      this.savePending = shouldRunFollowUpSave({
        hasCurrentSession: !!this.currentSession,
        currentMutationVersion: this.localMutationVersion,
        savedMutationVersion,
      })

      if (this.savePending && this.currentSession) {
        generalLogger.debug('[AuthenticatedSessionEngine] Processing queued save', {
          reportId: this.currentSession.reportId,
        })
      }
    } while (this.savePending && this.currentSession)
  }

  /**
   * Execute the actual save operation (internal)
   *
   * Includes retry with backoff (max 2 attempts) for transient network errors.
   * Validation errors (4xx) are NOT retried.
   *
   * Cross-app contract sentinel: the delegated executor still records
   * pool-pressure via recordSessionPoolPressureFromHttpError and gates retries
   * through isRetryableSessionSaveError.
   */
  private async executeSave(
    reason: AuthenticatedSessionSaveReason,
    queueReportId: string,
    queueLifecycleVersion: number
  ): Promise<number> {
    return executeAuthenticatedSessionSave({
      reason,
      queueReportId,
      queueLifecycleVersion,
      getState: () => ({
        currentSession: this.currentSession,
        sessionLifecycleVersion: this.sessionLifecycleVersion,
        localMutationVersion: this.localMutationVersion,
        savePending: this.savePending,
        lastPersistedSaveFingerprint: this.lastPersistedSaveFingerprint,
      }),
      isActiveSaveQueue: (reportId, lifecycleVersion) =>
        this.isActiveSaveQueue(reportId, lifecycleVersion),
      replaceCurrentSession: (session) => {
        this.currentSession = session
      },
      normalizeReportId: () => this.normalizeReportId(),
      setLastPersistedSaveFingerprint: (fingerprint) => {
        this.lastPersistedSaveFingerprint = fingerprint
      },
    })
  }

  /**
   * Ensure this.currentSession.reportId matches the originally requested reportId.
   *
   * The Titan API returns reportId as session_key (e.g. "val_xxx") even when the
   * lookup was performed with a UUID (report_id). The Zustand store compares
   * session.reportId against the URL's reportId to decide the loading stage, so
   * a mismatch causes an infinite loading screen. This method is called after
   * every operation that replaces this.currentSession.
   */
  private normalizeReportId(): void {
    if (this.currentSession) {
      this.currentSession = normalizeAuthenticatedSessionReportId(
        this.currentSession,
        this.requestedReportId
      )
    }
  }

  /**
   * Clear session (backend + local state)
   */
  clearSession(): void {
    this.sessionLifecycleVersion += 1

    if (this.currentSession) {
      sessionService.clearSessionCache(this.currentSession.reportId)

      generalLogger.debug('[AuthenticatedSessionEngine] Cleared session', {
        reportId: this.currentSession.reportId,
      })
    }

    this.currentSession = null
    this.requestedReportId = null
    this.loadingPromise = null
    this.loadingReportId = null
    this.loadSequence += 1
    this.pendingUpdates = []
    this.savePromise = null
    this.saveReportId = null
    this.saveLifecycleVersion = this.sessionLifecycleVersion
    this.savePending = false
    this.lastPersistedSaveFingerprint = null
  }

  /**
   * Get current report ID
   */
  getReportId(): string | null {
    return this.currentSession?.reportId || null
  }

  /**
   * Get current session data
   */
  getSessionData(): SessionDataRecord | null {
    return (this.currentSession?.sessionData as SessionDataRecord | undefined) || null
  }

  /**
   * Get current session (full object)
   */
  getSession(): ValuationSession | null {
    return this.currentSession
  }
}
