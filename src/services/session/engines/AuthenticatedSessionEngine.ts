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
import { preserveClientRecoveredHtmlWhenServerSessionStale } from '../../../utils/reportHtmlRecovery'
import { sessionService } from '../../index'
import type { FlowType, ISessionEngine, SessionDataRecord } from '../SessionEngine'

/**
 * Backend-computed fields that must NOT round-trip through autosave PATCHes.
 *
 * The session blob the engine holds in memory mirrors what Titan returns —
 * including the heavy server-rendered artifacts (``valuation_result``, the
 * HTML report, the PDF-HTML report, and their underscore-prefixed mirrors).
 * Sending them back in every PATCH causes:
 *   1. **Multi-MB payloads** — METANOUS revisit shipped 13.9MB per autosave
 *      (Titan log: `content-length: 13920316`), which spent ~5.5s on the
 *      wire and twice triggered "Premature close" 500s.
 *   2. **Race-condition data loss** — every PATCH overwrites the server's
 *      authoritative ``valuation_result`` with the engine's stale copy.
 *      If a parallel backend update fired (PDF gen, normalization,
 *      benchmark refresh), our PATCH would clobber it.
 *
 * These keys are produced server-side and never edited by the form, so
 * the autosave PATCH can safely omit them. The next GET pulls the
 * authoritative blob back if the in-memory copy needed refreshing.
 */
const BACKEND_COMPUTED_SESSION_KEYS = new Set<string>([
  'valuation_result',
  'valuationResult',
  '_valuationResult',
  'html_report',
  'htmlReport',
  '_htmlReport',
  'pdf_html_report',
  'pdfHtmlReport',
  '_pdfHtmlReport',
  'pdfHtml',
  'reportHtml',
  'report_context',
])

function stripBackendComputedFields(payload: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {}
  let removedCount = 0
  let removedBytes = 0
  for (const [key, value] of Object.entries(payload)) {
    if (BACKEND_COMPUTED_SESSION_KEYS.has(key)) {
      removedCount += 1
      // Best-effort size estimate so the log is informative — JSON.stringify
      // on the value is bounded by the keys we're stripping (kBs at most for
      // metadata, but valuation_result + html_report can be MB-class).
      try {
        removedBytes += JSON.stringify(value)?.length ?? 0
      } catch {
        /* unstringifiable — skip the byte count, keep the strip */
      }
      continue
    }
    stripped[key] = value
  }
  if (removedCount > 0) {
    generalLogger.debug(
      '[AuthenticatedSessionEngine] Stripped backend-computed keys from autosave',
      {
        removedCount,
        approxBytesRemoved: removedBytes,
      }
    )
  }
  return stripped
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function coerceStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^\d{3}$/.test(trimmed) ? Number(trimmed) : undefined
}

function readNumericStatus(value: unknown, seen = new Set<unknown>()): number | undefined {
  const record = asRecord(value)
  if (!record || seen.has(value)) return undefined
  seen.add(value)

  const directStatus = record.status ?? record.statusCode
  const directNumericStatus = coerceStatus(directStatus)
  if (directNumericStatus !== undefined) return directNumericStatus

  const response = asRecord(record.response)
  const responseStatus = coerceStatus(response?.status)
  if (responseStatus !== undefined) return responseStatus

  const context = asRecord(record.context)
  const contextStatus = coerceStatus(context?.statusCode ?? context?.status)
  if (contextStatus !== undefined) return contextStatus

  const nestedStatus = readNumericStatus(context?.originalError, seen)
  if (nestedStatus !== undefined) return nestedStatus

  return readNumericStatus(response?.data, seen)
}

function collectErrorText(value: unknown, seen = new Set<unknown>()): string {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  if (!record || seen.has(value)) return ''
  seen.add(value)

  const parts = [
    typeof record.name === 'string' ? record.name : undefined,
    typeof record.code === 'string' ? record.code : undefined,
    typeof record.message === 'string' ? record.message : undefined,
  ]

  const response = asRecord(record.response)
  const responseData = response?.data
  const responseRecord = asRecord(responseData)
  parts.push(typeof responseData === 'string' ? responseData : undefined)
  parts.push(typeof responseRecord?.message === 'string' ? responseRecord.message : undefined)
  parts.push(typeof responseRecord?.error === 'string' ? responseRecord.error : undefined)

  const context = asRecord(record.context)
  parts.push(typeof context?.code === 'string' ? context.code : undefined)
  parts.push(collectErrorText(context?.originalError, seen))

  return parts.filter(Boolean).join(' ')
}

function readRetryableStatusFromText(text: string): number | undefined {
  const statusMatch = text.match(/\b(?:status(?:\s+code)?|http)\s*:?\s*(408|429|499|5\d{2})\b/i)
  if (statusMatch?.[1]) return Number(statusMatch[1])

  const namedStatusMatch = text.match(
    /\b(408|429|499|5\d{2})\s+(?:request timeout|too many requests|client closed request|service unavailable|server error|internal server error|bad gateway|gateway timeout)\b/i
  )
  return namedStatusMatch?.[1] ? Number(namedStatusMatch[1]) : undefined
}

function isRetryableSessionSaveError(error: unknown): boolean {
  const status = readNumericStatus(error)
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409) {
    return false
  }
  if (
    status === 408 ||
    status === 429 ||
    status === 499 ||
    (status !== undefined && status >= 500 && status < 600)
  ) {
    return true
  }

  if (error instanceof TypeError) return true

  const text = collectErrorText(error).toLowerCase()
  if (
    text.includes('authentication required') ||
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('invalid authentication token')
  ) {
    return false
  }

  if (readRetryableStatusFromText(text) !== undefined) return true

  return (
    text.includes('fetch') ||
    text.includes('network') ||
    text.includes('econnrefused') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('aborterror') ||
    text.includes('aborted') ||
    text.includes('canceled') ||
    text.includes('cancelled') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('temporarily unavailable') ||
    text.includes('service unavailable') ||
    text.includes('did not respond in time') ||
    text.includes('upstream_timeout') ||
    text.includes('server error') ||
    text.includes('bad gateway') ||
    text.includes('gateway timeout')
  )
}

const AUTOSAVE_SETTLE_MS = 750

function mergeQueuedLocalSession(
  serverSession: ValuationSession,
  localSession: ValuationSession
): ValuationSession {
  const merged: ValuationSession = {
    ...serverSession,
    ...localSession,
    status: serverSession.status ?? localSession.status,
    reportReady:
      localSession.reportReady === true
        ? true
        : (serverSession.reportReady ?? localSession.reportReady),
    sessionData: {
      ...(serverSession.sessionData || {}),
      ...(localSession.sessionData || {}),
    },
    partialData: {
      ...(serverSession.partialData || {}),
      ...(localSession.partialData || {}),
    },
  }

  return preserveClientRecoveredHtmlWhenServerSessionStale(merged, localSession)
}

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
  private localMutationVersion = 0

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

    const previousSessionData = this.currentSession.sessionData
    const previousPartialData = this.currentSession.partialData

    this.currentSession = {
      ...this.currentSession,
      ...updates,
      updatedAt: new Date(),
    }

    // Merge sessionData if provided
    if (updates.sessionData) {
      this.currentSession.sessionData = {
        ...(previousSessionData || {}),
        ...updates.sessionData,
      }
    }

    // Merge partialData if provided
    if (updates.partialData) {
      this.currentSession.partialData = {
        ...(previousPartialData || {}),
        ...updates.partialData,
      }
    }

    this.localMutationVersion += 1
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
        // Mirror loadSession + hydrateSession's no-current-session branch: any
        // path that mints currentSession also pins requestedReportId so the
        // normalizeReportId() guards on every later mutation have something to
        // pin against. Without this, a subsequent updater can still drift the
        // session id away from the URL.
        this.requestedReportId = updates.reportId

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

    // Single drain promise: all callers await the same serialized queue. When
    // another autosave arrives mid-flight we mark one follow-up pass, and that
    // pass snapshots the latest in-memory session state.
    if (this.savePromise) {
      this.savePending = true
      generalLogger.debug('[AuthenticatedSessionEngine] Save already in progress, queuing', {
        reportId: this.currentSession.reportId,
        reason,
      })
      await this.savePromise
      return
    }

    try {
      this.savePromise = this.drainSaveQueue(reason)
      await this.savePromise
    } finally {
      this.savePromise = null
      this.savePending = false
    }
  }

  private async drainSaveQueue(reason: 'user' | 'autosave' | 'system'): Promise<void> {
    let nextReason = reason

    do {
      if (nextReason === 'autosave') {
        await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_SETTLE_MS))
      }

      // Absorb callers that arrived during the autosave settle window into the
      // single snapshot about to be sent. Mutations that happen while the HTTP
      // request is in-flight will flip savePending again and schedule one
      // follow-up pass below.
      this.savePending = false
      const savedMutationVersion = await this.executeSave(nextReason)
      nextReason = 'autosave'

      if (
        this.savePending &&
        this.currentSession &&
        this.localMutationVersion <= savedMutationVersion
      ) {
        this.savePending = false
      }

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
   */
  private async executeSave(reason: 'user' | 'autosave' | 'system'): Promise<number> {
    if (!this.currentSession) return this.localMutationVersion

    const MAX_ATTEMPTS = 2
    const BACKOFF_MS = [1000, 3000]

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        // Strip server-rendered artifacts (valuation_result, html_report,
        // pdf_html_report) before shipping the PATCH. These are produced
        // backend-side and don't need to round-trip — leaving them in
        // turned the autosave into a multi-MB upload that triggered
        // ``Premature close`` 500s on the METANOUS revisit (Titan log
        // content-length: 13920316). See BACKEND_COMPUTED_SESSION_KEYS.
        const mergedPayload = {
          ...(this.currentSession.sessionData || {}),
          ...(this.currentSession.partialData || {}),
        }
        const updates = {
          ...stripBackendComputedFields(mergedPayload),
          currentView: this.currentSession.currentView,
          ...(this.currentSession.name !== undefined && { name: this.currentSession.name }),
        }
        const mutationVersionAtSend = this.localMutationVersion

        const updatedSession = await sessionService.saveSession(
          this.currentSession.reportId,
          updates
        )

        if (updatedSession) {
          const localSession: ValuationSession | null = this.currentSession
          if (
            localSession &&
            (this.savePending || this.localMutationVersion !== mutationVersionAtSend)
          ) {
            this.currentSession = mergeQueuedLocalSession(updatedSession, localSession)
          } else {
            this.currentSession = localSession
              ? preserveClientRecoveredHtmlWhenServerSessionStale(updatedSession, localSession)
              : updatedSession
          }
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

        return mutationVersionAtSend
      } catch (error) {
        const isRetryableError = isRetryableSessionSaveError(error)
        const isLastAttempt = attempt >= MAX_ATTEMPTS - 1

        if (!isRetryableError || isLastAttempt) {
          generalLogger.error('[AuthenticatedSessionEngine] Failed to save session', {
            reportId: this.currentSession?.reportId,
            reason,
            attempt: attempt + 1,
            isRetryableError,
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

    return this.localMutationVersion
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
