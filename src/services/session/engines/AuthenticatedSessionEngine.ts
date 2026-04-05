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

import type { ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { sessionService } from '../../index'
import type { FlowType, ISessionEngine } from '../SessionEngine'

/**
 * Authenticated Session Engine
 *
 * Full backend integration - wraps existing SessionService
 *
 * BANK-GRADE: Handles race conditions during async session loading.
 * Tracks pending load promise to prevent "no current session" errors
 * when updateSession is called before loadSession completes.
 */
export class AuthenticatedSessionEngine implements ISessionEngine {
  private currentSession: ValuationSession | null = null
  private loadingPromise: Promise<ValuationSession | null> | null = null
  private loadingReportId: string | null = null
  private pendingUpdates: Partial<ValuationSession>[] = []

  // The reportId originally requested (from URL). The API may return a different
  // format (session_key like "val_xxx" instead of the UUID used in Mercury URLs).
  // We always normalize this.currentSession.reportId back to the requested value
  // so the Zustand store's stage check (session.reportId === reportId) never fails.
  private requestedReportId: string | null = null

  // ✅ RACE CONDITION FIX: Track ongoing save operations to prevent concurrent saves
  // Multiple hooks can trigger saves simultaneously, causing data loss when they race
  private savePromise: Promise<void> | null = null
  private savePending: boolean = false

  /**
   * Load session from backend
   *
   * BANK-GRADE: Tracks loading state and applies pending updates after load completes.
   */
  async loadSession(
    reportId: string,
    flow: FlowType = 'manual',
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null> {
    // Track that we're loading this reportId
    this.loadingReportId = reportId

    try {
      const loadPromise = sessionService.loadSession(reportId, flow, prefilledQuery)
      this.loadingPromise = loadPromise

      const session = await loadPromise

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
      generalLogger.error('[AuthenticatedSessionEngine] Failed to load session', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      this.loadingPromise = null
      this.loadingReportId = null
    }
  }

  /**
   * Apply update to current session (internal helper)
   */
  private applyUpdate(updates: Partial<ValuationSession>): void {
    if (!this.currentSession) return

    this.currentSession = {
      ...this.currentSession,
      ...updates,
      updatedAt: new Date(),
    }

    // Merge sessionData if provided
    if (updates.sessionData) {
      this.currentSession.sessionData = {
        ...(this.currentSession.sessionData || {}),
        ...updates.sessionData,
      }
    }

    // Merge partialData if provided
    if (updates.partialData) {
      this.currentSession.partialData = {
        ...(this.currentSession.partialData || {}),
        ...updates.partialData,
      }
    }
  }

  hydrateSession(updates: Partial<ValuationSession>): void {
    if (!this.currentSession) {
      if (!updates.reportId) {
        generalLogger.debug(
          '[AuthenticatedSessionEngine] Skipping hydrate - no current session and no reportId'
        )
        return
      }

      this.currentSession = {
        reportId: updates.reportId,
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
      } as ValuationSession
      this.requestedReportId = updates.reportId
      this.normalizeReportId()
      return
    }

    const previousUpdatedAt = this.currentSession.updatedAt
    this.applyUpdate(updates)
    if (this.currentSession) {
      this.currentSession.updatedAt = updates.updatedAt || previousUpdatedAt || new Date()
    }
  }

  /**
   * Update session (backend + local state)
   *
   * BOOTSTRAP FIX: Handles the case where session is being set for the first time
   * during bootstrap flow (when no loadSession was called because it's a new report).
   *
   * BANK-GRADE: Queues updates during async loadSession to prevent race conditions.
   */
  updateSession(updates: Partial<ValuationSession>): void {
    // Handle case where session is being set for the first time (bootstrap flow)
    if (!this.currentSession) {
      // BANK-GRADE: If we're currently loading, queue the update
      if (this.loadingPromise && this.loadingReportId) {
        generalLogger.debug('[AuthenticatedSessionEngine] Queueing update during load', {
          loadingReportId: this.loadingReportId.substring(0, 30),
          updateKeys: Object.keys(updates),
        })
        this.pendingUpdates.push(updates)
        return
      }

      if (updates.reportId) {
        // Bootstrap is setting initial session - accept it
        this.currentSession = {
          reportId: updates.reportId,
          currentView: updates.currentView || 'manual',
          dataSource: updates.dataSource || 'manual',
          createdAt: updates.createdAt || new Date(),
          updatedAt: new Date(),
          sessionData: updates.sessionData || {},
          partialData: updates.partialData || {},
          ...(updates.status && { status: updates.status }),
          ...(updates.reportReady !== undefined && { reportReady: updates.reportReady }),
          ...(updates.name && { name: updates.name }),
          ...(updates.valuationResult && { valuationResult: updates.valuationResult }),
          ...(updates.htmlReport && { htmlReport: updates.htmlReport }),
        } as ValuationSession

        generalLogger.debug(
          '[AuthenticatedSessionEngine] Session initialized from updates (bootstrap flow)',
          {
            reportId: updates.reportId,
            hasSessionData: !!updates.sessionData,
          }
        )
        return
      }

      // BANK-GRADE: Downgrade from error to debug - this is often non-critical
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

    generalLogger.debug('[AuthenticatedSessionEngine] Updated session (local)', {
      reportId: this.currentSession.reportId,
      updateKeys: Object.keys(updates),
    })

    // Backend persistence happens via saveSession (auto-save or manual)
  }

  /**
   * Save session to backend
   *
   * BANK-GRADE: Waits for pending load before saving, if applicable.
   *
   * ✅ RACE CONDITION FIX: Debounces and deduplicates concurrent saves.
   * If a save is already in progress, queues a follow-up save with the latest data.
   * This prevents multiple concurrent PATCH requests that can cause data loss.
   */
  async saveSession(reason: 'user' | 'autosave' | 'system' = 'autosave'): Promise<void> {
    // If we're loading, wait for it to complete first
    if (this.loadingPromise) {
      generalLogger.debug('[AuthenticatedSessionEngine] Waiting for load to complete before saving')
      await this.loadingPromise
    }

    if (!this.currentSession) {
      // BANK-GRADE: Downgrade from warn to debug for non-critical cases
      generalLogger.debug('[AuthenticatedSessionEngine] Skipping save - no current session', {
        reason,
      })
      return
    }

    // ✅ RACE CONDITION FIX: If a save is already in progress, mark pending and wait
    // This ensures we don't send concurrent PATCH requests that race
    if (this.savePromise) {
      this.savePending = true
      generalLogger.debug('[AuthenticatedSessionEngine] Save already in progress, queuing', {
        reportId: this.currentSession.reportId,
        reason,
      })

      // Store reference to current promise before awaiting
      const currentSavePromise = this.savePromise

      // Wait for current save to complete
      try {
        await currentSavePromise
      } catch {
        // Ignore errors from the previous save, we'll try again
      }

      // If savePending is still true, it means another save was queued while we were waiting
      // Exit and let that one handle it (it will process the queue in its finally block)
      // This prevents an avalanche of queued saves
      if (this.savePending) {
        generalLogger.debug('[AuthenticatedSessionEngine] Another save is handling the queue', {
          reportId: this.currentSession?.reportId,
        })
        return
      }
    }

    // Clear pending flag since we're about to save
    this.savePending = false

    try {
      // Create the save promise
      this.savePromise = this.executeSave(reason)
      await this.savePromise
    } finally {
      this.savePromise = null

      // If more saves were queued while we were saving, trigger another save
      if (this.savePending && this.currentSession) {
        this.savePending = false
        generalLogger.debug('[AuthenticatedSessionEngine] Processing queued save', {
          reportId: this.currentSession.reportId,
        })
        // Don't await - let it run in the background
        this.saveSession('autosave').catch((err) => {
          generalLogger.error('[AuthenticatedSessionEngine] Queued save failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
    }
  }

  /**
   * Execute the actual save operation (internal)
   *
   * Includes retry with backoff (max 2 attempts) for transient network errors.
   * Validation errors (4xx) are NOT retried.
   */
  private async executeSave(reason: 'user' | 'autosave' | 'system'): Promise<void> {
    if (!this.currentSession) return

    const MAX_ATTEMPTS = 2
    const BACKOFF_MS = [1000, 3000]

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const updates = {
          ...(this.currentSession.sessionData || {}),
          ...(this.currentSession.partialData || {}),
          currentView: this.currentSession.currentView,
          ...(this.currentSession.name !== undefined && { name: this.currentSession.name }),
        }

        const updatedSession = await sessionService.saveSession(
          this.currentSession.reportId,
          updates
        )

        if (updatedSession) {
          this.currentSession = updatedSession
          this.normalizeReportId()

          if (attempt > 0) {
            generalLogger.info('[AuthenticatedSessionEngine] Session saved after retry', {
              reportId: this.currentSession.reportId,
              reason,
              attempt: attempt + 1,
            })
          } else {
            generalLogger.debug('[AuthenticatedSessionEngine] Session saved to backend', {
              reportId: this.currentSession.reportId,
              reason,
            })
          }
        }

        return
      } catch (error) {
        const isNetworkError =
          error instanceof TypeError ||
          (error instanceof Error &&
            (error.message.includes('fetch') ||
              error.message.includes('network') ||
              error.message.includes('ECONNREFUSED') ||
              error.message.includes('ETIMEDOUT') ||
              error.name === 'AbortError'))

        const isLastAttempt = attempt >= MAX_ATTEMPTS - 1

        if (!isNetworkError || isLastAttempt) {
          generalLogger.error('[AuthenticatedSessionEngine] Failed to save session', {
            reportId: this.currentSession?.reportId,
            reason,
            attempt: attempt + 1,
            isNetworkError,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }

        generalLogger.warn('[AuthenticatedSessionEngine] Transient save error, retrying', {
          reportId: this.currentSession?.reportId,
          attempt: attempt + 1,
          backoffMs: BACKOFF_MS[attempt],
          error: error instanceof Error ? error.message : String(error),
        })

        await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt]))
      }
    }
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
    if (
      this.currentSession &&
      this.requestedReportId &&
      this.currentSession.reportId !== this.requestedReportId
    ) {
      this.currentSession = { ...this.currentSession, reportId: this.requestedReportId }
    }
  }

  /**
   * Clear session (backend + local state)
   */
  clearSession(): void {
    if (this.currentSession) {
      sessionService.clearSessionCache(this.currentSession.reportId)

      generalLogger.debug('[AuthenticatedSessionEngine] Cleared session', {
        reportId: this.currentSession.reportId,
      })
    }

    this.currentSession = null
    this.requestedReportId = null
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
  getSessionData(): any | null {
    return this.currentSession?.sessionData || null
  }

  /**
   * Get current session (full object)
   */
  getSession(): ValuationSession | null {
    return this.currentSession
  }
}
