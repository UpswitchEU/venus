/**
 * Session API Service
 *
 * Single Responsibility: Handle all valuation session lifecycle operations
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/session/SessionAPI
 */

import type {
  CreateValuationSessionRequest,
  UpdateValuationSessionRequest,
} from '../../../types/api'
import type {
  CreateValuationSessionResponse,
  SaveValuationResultResponse,
  SwitchViewResponse,
  UpdateValuationSessionResponse,
  ValuationSessionResponse,
} from '../../../types/api-responses'
import { APIError, AuthenticationError, ValidationError } from '../../../types/errors'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { convertToApplicationError } from '../../../utils/errors/errorConverter'
import {
  isNetworkError,
  isSessionConflictError,
  isValidationError,
} from '../../../utils/errors/errorGuards'
import { apiLogger } from '../../../utils/logger'
import {
  stripReportBlobsFromSessionPatch,
  stripReportsFromValuationSessionPatchUpdates,
} from '../../../utils/stripReportBlobsFromSessionPatch'
import { APIRequestConfig, HttpClient } from '../HttpClient'
import {
  isHttpStatus,
  isTimeoutLikeError,
  requestConfig,
  responseMessage,
  toAxiosLikeError,
} from './SessionApiHttp'
import {
  asSessionRecord,
  normalizeBackendSessionPayload,
  normalizeSessionView,
  parseGetSessionResponse,
  type SessionRecord,
} from './SessionApiNormalization'

type SessionEnvelope<T> = {
  success?: boolean
  data?: T
  error?: string
}

export type CreateValuationSessionInput = Partial<CreateValuationSessionRequest> &
  Omit<Partial<ValuationSession>, 'partialData' | 'sessionData'> & {
    current_step?: number
    partialData?: SessionRecord
    sessionData?: SessionRecord
    session_key?: string
  }

type SaveValuationResultPayload = {
  sessionData?: SessionRecord
  valuationResult?: Partial<ValuationResponse> | SessionRecord
  htmlReport?: string
  name?: string
}

function asRecord(value: unknown): SessionRecord | null {
  return asSessionRecord(value)
}

function emptyOptimisticUpdate(): UpdateValuationSessionResponse {
  return {
    success: true,
    session: null as unknown as ValuationSession,
    updated: false,
  }
}

function isBackendSessionPayload(value: SessionRecord | null): value is SessionRecord {
  return !!(
    value &&
    ('id' in value ||
      'reportId' in value ||
      'session_key' in value ||
      'session_data' in value ||
      'sessionData' in value ||
      'view_type' in value)
  )
}

function normalizeUpdateSessionResponse(response: unknown): UpdateValuationSessionResponse {
  const responseRecord = asRecord(response)
  const nestedData = asRecord(responseRecord?.data)
  const sessionPayload = isBackendSessionPayload(nestedData)
    ? nestedData
    : isBackendSessionPayload(responseRecord)
      ? responseRecord
      : null
  const sessionData = sessionPayload ? normalizeBackendSessionPayload(sessionPayload) : null

  return {
    success: typeof responseRecord?.success === 'boolean' ? responseRecord.success : true,
    session: sessionData as unknown as ValuationSession,
    updated: true,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function transientSessionPatchMessage(error: unknown): string {
  const axiosError = toAxiosLikeError(error)
  const responseData = axiosError.response?.data
  const responseRecord = asRecord(responseData)
  return [
    axiosError.message,
    typeof responseData === 'string' ? responseData : undefined,
    typeof responseRecord?.message === 'string' ? responseRecord.message : undefined,
    typeof responseRecord?.error === 'string' ? responseRecord.error : undefined,
  ]
    .filter(Boolean)
    .join(' ')
}

function isTransientSessionPatchError(error: unknown): boolean {
  const axiosError = toAxiosLikeError(error)
  const status = axiosError.response?.status
  if (status === 429 || status === 404) {
    return false
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return true
  }
  if (isNetworkError(error) || isTimeoutLikeError(error)) {
    return true
  }
  const message = transientSessionPatchMessage(error).toLowerCase()
  return (
    message.includes('premature close') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('connection terminated') ||
    message.includes('network error')
  )
}

export class SessionAPI extends HttpClient {
  private static deletedSessionTombstones = new Map<string, number>()
  private static readonly DELETION_TOMBSTONE_TTL_MS = 120000
  private static readonly TRANSIENT_PATCH_RETRY_DELAYS_MS = [500, 1500]

  private static markSessionDeleted(reportId: string): void {
    SessionAPI.deletedSessionTombstones.set(reportId, Date.now())
  }

  private static clearDeletedSessionMarker(reportId?: string): void {
    if (!reportId) return
    SessionAPI.deletedSessionTombstones.delete(reportId)
  }

  private static hasRecentDeletedSession(reportId: string): boolean {
    const deletedAt = SessionAPI.deletedSessionTombstones.get(reportId)
    if (!deletedAt) {
      return false
    }

    const age = Date.now() - deletedAt
    if (age >= SessionAPI.DELETION_TOMBSTONE_TTL_MS) {
      SessionAPI.deletedSessionTombstones.delete(reportId)
      return false
    }

    return true
  }

  private async patchValuationSessionWithTransientRetry(
    reportId: string,
    patchBody: Record<string, unknown>,
    options?: APIRequestConfig
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.executeRequest<unknown>(
          requestConfig({
            method: 'PATCH',
            url: `/api/v2/valuations/sessions/${reportId}`,
            data: patchBody,
            headers: {},
          }),
          options
        )
      } catch (error) {
        const retryDelay = SessionAPI.TRANSIENT_PATCH_RETRY_DELAYS_MS[attempt]
        if (!isTransientSessionPatchError(error) || retryDelay == null) {
          throw error
        }
        apiLogger.warn('Transient session PATCH failed, retrying', {
          reportId,
          attempt: attempt + 1,
          retryDelay,
          status: toAxiosLikeError(error).response?.status,
          message: transientSessionPatchMessage(error),
        })
        await delay(retryDelay)
      }
    }
  }

  /**
   * Titan's PATCH DTO is canonical snake_case. Keep Venus-only envelopes and metadata out of the
   * top-level body so strict backend validation does not reject autosaves.
   */
  private static mapTitanPatchAndStripReportBlobs(
    patch: Partial<ValuationSession> | undefined
  ): Record<string, unknown> {
    const p = patch as Record<string, unknown> | undefined
    if (!p) {
      return {}
    }

    const sessionData: Record<string, unknown> = {}
    const mergeIntoSessionData = (value: unknown): void => {
      const record = asRecord(value)
      if (record) {
        Object.assign(sessionData, record)
      }
    }

    mergeIntoSessionData(p.session_data)
    mergeIntoSessionData(p.sessionData)
    mergeIntoSessionData(p.partial_data)
    mergeIntoSessionData(p.partialData)

    const mappedCurrentView = p.currentView === 'conversational' ? 'ai-guided' : p.currentView
    const mappedDataSource = p.dataSource === 'conversational' ? 'ai-guided' : p.dataSource

    if (mappedCurrentView !== undefined) {
      sessionData.currentView = mappedCurrentView
    }
    if (mappedDataSource !== undefined) {
      sessionData.dataSource = mappedDataSource
    }
    if (typeof p.name === 'string') {
      sessionData.name = p.name
    }

    const knownTopLevelKeys = new Set([
      'buyerReadiness',
      'calculatedAt',
      'completedAt',
      'completeness',
      'createdAt',
      'current_step',
      'currentStep',
      'currentView',
      'dataSource',
      'guest_session_id',
      'htmlReport',
      'lastSyncedAt',
      'name',
      'partial_data',
      'partialData',
      'reportId',
      'reportReady',
      'session_data',
      'sessionData',
      'status',
      'updatedAt',
      'valuationResult',
      'view_type',
    ])

    for (const [key, value] of Object.entries(p)) {
      if (!knownTopLevelKeys.has(key)) {
        sessionData[key] = value
      }
    }

    const titanPatch: Record<string, unknown> = {}
    const strippedSessionData = stripReportBlobsFromSessionPatch(sessionData)
    if (
      strippedSessionData &&
      typeof strippedSessionData === 'object' &&
      !Array.isArray(strippedSessionData) &&
      Object.keys(strippedSessionData as Record<string, unknown>).length > 0
    ) {
      titanPatch.session_data = strippedSessionData
    }

    const rawViewType = p.view_type ?? mappedCurrentView
    if (rawViewType === 'simple' || rawViewType === 'advanced') {
      titanPatch.view_type = rawViewType
    } else if (rawViewType === 'manual') {
      titanPatch.view_type = 'simple'
    } else if (rawViewType === 'conversational' || rawViewType === 'ai-guided') {
      titanPatch.view_type = 'advanced'
    }

    const currentStep = p.current_step ?? p.currentStep
    if (typeof currentStep === 'number' && Number.isInteger(currentStep) && currentStep >= 1) {
      titanPatch.current_step = currentStep
    }

    if (p.status === 'active' || p.status === 'completed' || p.status === 'expired') {
      titanPatch.status = p.status
    }
    if (typeof p.guest_session_id === 'string') {
      titanPatch.guest_session_id = p.guest_session_id
    }

    return stripReportsFromValuationSessionPatchUpdates(titanPatch) as Record<string, unknown>
  }

  /**
   * PATCH 404 → create: merge store `session_data` with `sessionData` / `partialData` only.
   * Spreading the whole PATCH used to nest a `sessionData` property and hide unstripped HTML.
   */
  private static flattenStoreAndPatchIntoSessionDataForCreate(
    storeSessionData: Record<string, unknown> | undefined,
    patch: Partial<ValuationSession> | undefined
  ): Record<string, unknown> {
    const u = (patch || {}) as Record<string, unknown>
    const base: Record<string, unknown> = { ...(storeSessionData || {}) }
    const sd = u.sessionData
    const pd = u.partialData
    if (sd && typeof sd === 'object' && !Array.isArray(sd)) {
      Object.assign(base, sd as Record<string, unknown>)
    }
    if (pd && typeof pd === 'object' && !Array.isArray(pd)) {
      Object.assign(base, pd as Record<string, unknown>)
    }
    return stripReportBlobsFromSessionPatch(base) as Record<string, unknown>
  }

  /**
   * Get valuation session data
   *
   * ✅ CLEAN ARCHITECTURE: Removed request deduplication cache
   * Backend handles idempotency for CREATE requests via ON CONFLICT
   * GET requests are naturally idempotent, no deduplication needed
   */
  async getValuationSession(
    reportId: string,
    options?: APIRequestConfig
  ): Promise<ValuationSessionResponse | null> {
    return this.getValuationSessionWithRetry(reportId, options)
  }

  /**
   * Internal method with retry logic
   */
  private async getValuationSessionWithRetry(
    reportId: string,
    options?: APIRequestConfig,
    attempt = 0
  ): Promise<ValuationSessionResponse | null> {
    const maxRetries = 3
    const baseDelay = 1000 // 1 second

    try {
      // Add 10-second timeout per attempt
      const timeoutOptions = {
        ...options,
        timeout: 10000,
      }

      // ✅ FIX: HttpClient unwraps response.data?.data || response.data
      // Backend returns: res.json({ success: true, data: sessionObject })
      // Axios receives: { success: true, data: sessionObject }
      // HttpClient extracts: response.data?.data || response.data
      //   - response.data = { success: true, data: sessionObject }
      //   - response.data.data = sessionObject
      //   - So HttpClient returns sessionObject directly
      // Therefore, response IS the session object
      const response = await this.executeRequest<unknown>(
        requestConfig({
          method: 'GET',
          url: `/api/v2/valuations/sessions/${reportId}`,
          headers: {},
        }),
        timeoutOptions
      )

      // ✅ FIX: HttpClient already unwrapped the response, so response IS the session data
      // But handle edge cases where structure might be different
      const parsedResponse = parseGetSessionResponse(response, reportId)
      if (!parsedResponse) {
        return null
      }

      // ✅ WORLD-CLASS: Normalize session data at API boundary
      // This is the SINGLE place where we convert backend naming to frontend naming
      const enrichedSessionData = normalizeBackendSessionPayload(parsedResponse.sessionData)

      // Return in expected format
      return {
        success: parsedResponse.success,
        session: enrichedSessionData,
      }
    } catch (error) {
      // Retry logic with exponential backoff
      const isRetryable = isNetworkError(error) || isTimeoutLikeError(error)

      if (isRetryable && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        apiLogger.warn('Session load failed, retrying', {
          reportId,
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: error instanceof Error ? error.message : String(error),
        })

        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.getValuationSessionWithRetry(reportId, options, attempt + 1)
      }

      // Max retries reached or non-retryable error
      const axiosError = toAxiosLikeError(error)

      apiLogger.error('[SessionAPI] GET session error', {
        reportId,
        status: axiosError?.response?.status,
        code: axiosError?.code,
      })

      // Handle 404 gracefully - session doesn't exist yet
      if (axiosError.response?.status === 404) {
        apiLogger.debug('Session does not exist yet', { reportId })
        return null
      }
      this.handleSessionError(error, 'get session')
    }
  }

  /**
   * Create new valuation session
   *
   * AUTH-FIRST ARCHITECTURE: Only used by AuthenticatedSessionEngine.
   * All users must be authenticated before accessing session features.
   *
   * Handles both CreateValuationSessionRequest and ValuationSession types.
   * Maps frontend 'conversational' to backend 'ai-guided' for both currentView and dataSource.
   */
  async createValuationSession(
    session: CreateValuationSessionInput,
    options?: APIRequestConfig
  ): Promise<CreateValuationSessionResponse> {
    try {
      // Log timing information for race condition detection
      const { useClientContext } = await import('../../../stores/clientContext')
      const context = useClientContext.getState()

      apiLogger.info('[SessionAPI] Creating session', {
        hasClientContext: context.isActingAsClient,
        clientContextHeaders: Object.keys(context.getContextHeaders()).length,
        timestamp: Date.now(),
        note: 'Timing information for race condition detection',
      })

      // Map frontend view types to backend view types
      // Frontend: 'manual' | 'conversational'
      // Backend: 'simple' | 'advanced'
      const currentView = normalizeSessionView(session.currentView)
      const viewType = currentView === 'conversational' ? 'advanced' : 'simple'

      // Build session_data object to send to Titan
      // Titan API expects: { session_data: {...}, view_type: 'simple'|'advanced', current_step: number }
      const sessionDataPayload = stripReportBlobsFromSessionPatch({
        ...(session.sessionData || {}),
        ...(session.partialData || {}),
        // Preserve currentView in session_data for restoration
        currentView: currentView,
        ...(session.dataSource && { dataSource: session.dataSource }),
        ...(typeof session.name === 'string' && { name: session.name }),
      }) as Record<string, unknown>

      // AUTH-FIRST: Guest session handling removed - authentication is required
      // Backend will extract userId from JWT token (req.user)

      // Use reportId as session_key if session_key is not provided
      // This ensures idempotency - if a reportId exists, use it as the session_key
      const sessionKeyCandidate = session.session_key || session.reportId
      const sessionKey = typeof sessionKeyCandidate === 'string' ? sessionKeyCandidate : undefined
      SessionAPI.clearDeletedSessionMarker(sessionKey)

      const backendSession = {
        session_data: sessionDataPayload,
        view_type: viewType,
        current_step: typeof session.current_step === 'number' ? session.current_step : 1,
        // Also send currentView at top level for DTO transformation
        currentView: currentView,
        // Always include session_key if available (from session_key or reportId)
        ...(sessionKey && { session_key: sessionKey }),
      }

      // ✅ VERIFICATION: HttpClient interceptor automatically adds client context headers via getOwnerHeaders()
      // Headers are added in HttpClient.setupInterceptors() -> getOwnerHeaders()
      // This ensures client context headers (X-Client-Context-User, etc.) are sent automatically
      // No explicit headers needed here - interceptor handles it

      // Backend endpoint: POST /api/v2/valuations/sessions
      // If session_key is provided in payload, Titan will use it (for idempotency)
      // Otherwise, Titan generates a new HMAC-signed session_key
      // Response will contain: { session_key, session_data, view_type, status, ... }
      const sessionData = asRecord(
        await this.executeRequest<unknown>(
          requestConfig({
            method: 'POST',
            url: '/api/v2/valuations/sessions',
            data: backendSession,
            headers: {}, // HttpClient interceptor adds client context headers automatically
          }),
          options
        )
      )

      // CRITICAL: Validate sessionData exists before accessing properties
      if (!sessionData) {
        throw new Error('Backend returned empty session data')
      }

      // Titan returns session_key, map it to reportId for Venus
      const reportIdCandidate = sessionData.session_key || sessionData.reportId
      const reportId = typeof reportIdCandidate === 'string' ? reportIdCandidate : undefined

      // CRITICAL: Validate required fields exist
      if (!reportId) {
        throw new Error(`Backend returned incomplete session data: missing session_key`)
      }

      const responseSessionData = asRecord(sessionData.session_data) ?? {}

      // Build Venus-compatible session object
      // Titan's response: { id, session_key, session_data, view_type, status, ... }
      // Venus expects: { reportId, currentView, sessionData, ... }
      const venusSession = {
        ...sessionData,
        reportId: reportId, // Use session_key as reportId
        currentView: currentView, // Preserve requested view
        sessionData: responseSessionData,
      } as unknown as ValuationSession
      if (typeof responseSessionData.name === 'string') {
        venusSession.name = responseSessionData.name
      } else if (typeof session.name === 'string') {
        venusSession.name = session.name
      }

      // Map backend 'ai-guided' to frontend 'conversational' (if it exists in session_data)
      if (responseSessionData.currentView === 'ai-guided') {
        venusSession.currentView = 'conversational'
      }
      if (responseSessionData.dataSource === 'ai-guided') {
        responseSessionData.dataSource = 'conversational'
      }

      return {
        success: true,
        session: venusSession,
        reportId: reportId,
      }
    } catch (error) {
      this.handleSessionError(error, 'create session')
    }
  }

  /**
   * Session creation deduplication map
   * Prevents multiple simultaneous session creation attempts for the same reportId
   *
   * WORLD-CLASS: Stores both promise and error state to prevent infinite retry loops
   */
  private static sessionCreationPromises = new Map<
    string,
    Promise<CreateValuationSessionResponse>
  >()
  private static sessionCreationErrors = new Map<string, { error: unknown; timestamp: number }>()
  private static readonly ERROR_COOLDOWN_MS = 30000 // 30 seconds cooldown after rate limit error

  /**
   * Update existing valuation session
   *
   * ✅ TWIN ENGINE ARCHITECTURE: This method is ONLY called by AuthenticatedSessionEngine
   * GuestSessionEngine never calls this (guests use localStorage only, no updates to backend)
   *
   * WORLD-CLASS: Handles 429 rate limits with exponential backoff
   * Prevents cascading failures from multiple simultaneous updates
   */
  async updateValuationSession(
    reportId: string,
    updates: UpdateValuationSessionRequest,
    options?: APIRequestConfig
  ): Promise<UpdateValuationSessionResponse> {
    try {
      const patchBody = SessionAPI.mapTitanPatchAndStripReportBlobs(updates.updates)

      // Backend endpoint: /api/v2/valuations/sessions/:reportId (PATCH, not PUT)
      const response = await this.patchValuationSessionWithTransientRetry(
        reportId,
        patchBody,
        options
      )

      return normalizeUpdateSessionResponse(response)
    } catch (error) {
      const axiosError = toAxiosLikeError(error)

      // ✅ WORLD-CLASS FIX: Handle 429 rate limit with exponential backoff
      if (axiosError.response?.status === 429) {
        apiLogger.warn('Rate limit hit during session update, retrying with backoff', {
          reportId,
          retryAfter: axiosError.response?.headers?.['retry-after'],
        })

        // Use exponential backoff for rate limit retries
        const { retryWithBackoff } = await import('../../../utils/retryWithBackoff')
        try {
          const retryPatchBody = SessionAPI.mapTitanPatchAndStripReportBlobs(updates.updates)

          const retriedResponse = await retryWithBackoff(
            async () => {
              return await this.executeRequest<unknown>(
                requestConfig({
                  method: 'PATCH',
                  url: `/api/v2/valuations/sessions/${reportId}`,
                  data: retryPatchBody,
                  headers: {},
                }),
                options
              )
            },
            {
              maxRetries: 2, // Only 2 retries for rate limits (429)
              initialDelay: 1000, // Start with 1 second delay
              maxDelay: 5000, // Max 5 seconds
              backoffMultiplier: 2,
            }
          )

          return normalizeUpdateSessionResponse(retriedResponse)
        } catch (retryError) {
          // Rate limit retries exhausted - return optimistic success for non-critical updates
          const isCriticalUpdate = !!(updates.updates?.sessionData || updates.updates?.currentView)
          if (!isCriticalUpdate) {
            apiLogger.warn(
              'Rate limit retries exhausted for non-critical update, returning optimistic success',
              {
                reportId,
                updateKeys: Object.keys(updates.updates || {}),
              }
            )
            // Return optimistic success - the update will be retried on next change
            return emptyOptimisticUpdate()
          }
          // Critical update failed - re-throw
          this.handleSessionError(retryError, 'update session')
        }
      }

      if (axiosError.response?.status === 404) {
        // ✅ TWIN ENGINE ARCHITECTURE: Handle 404 for authenticated users only
        // GuestSessionEngine never calls this method, so all callers are authenticated
        // Check if we have session data in the store (indicating this is a real session, not deleted)
        try {
          if (SessionAPI.hasRecentDeletedSession(reportId)) {
            apiLogger.warn('Skipping session auto-create because this session was just deleted', {
              reportId,
              tombstoneTtlMs: SessionAPI.DELETION_TOMBSTONE_TTL_MS,
            })
            return emptyOptimisticUpdate()
          }

          const { useSessionStore } = await import('../../../store/useSessionStore')
          const sessionStore = useSessionStore.getState()
          const currentSession = sessionStore.session

          // Only auto-create if:
          // 1. We have a session in the store with matching reportId
          // 2. The update is non-critical (like name updates)
          // 3. We're not trying to update a deleted session
          // Note: All callers are authenticated (GuestSessionEngine never calls this)

          if (currentSession && currentSession.reportId === reportId) {
            // ✅ WORLD-CLASS FIX: Check for recent rate limit errors (cooldown period)
            const recentError = SessionAPI.sessionCreationErrors.get(reportId)
            if (recentError) {
              const errorAge = Date.now() - recentError.timestamp
              if (errorAge < SessionAPI.ERROR_COOLDOWN_MS) {
                apiLogger.warn(
                  'Session creation blocked - recent rate limit error, returning optimistic success',
                  {
                    reportId,
                    errorAge_ms: errorAge,
                    cooldownRemaining_ms: SessionAPI.ERROR_COOLDOWN_MS - errorAge,
                    note: 'Update will be retried after cooldown period',
                  }
                )
                // Return optimistic success - don't retry during cooldown
                const isCriticalUpdate = !!(
                  updates.updates?.sessionData || updates.updates?.currentView
                )
                if (!isCriticalUpdate) {
                  return emptyOptimisticUpdate()
                }
              } else {
                // Cooldown expired - clear error and retry
                SessionAPI.sessionCreationErrors.delete(reportId)
              }
            }

            // ✅ DEDUPLICATION: Check if session creation is already in progress
            const existingPromise = SessionAPI.sessionCreationPromises.get(reportId)
            if (existingPromise) {
              apiLogger.debug(
                'Session creation already in progress, waiting for existing promise',
                {
                  reportId,
                }
              )
              try {
                // Wait for existing creation to complete
                const createResponse = await existingPromise
                return {
                  success: createResponse.success,
                  session: createResponse.session,
                  updated: true,
                }
              } catch (promiseError) {
                // If existing promise failed, check if it was a rate limit
                if (isHttpStatus(promiseError, 429)) {
                  // Rate limit - return optimistic success for non-critical updates
                  const isCriticalUpdate = !!(
                    updates.updates?.sessionData || updates.updates?.currentView
                  )
                  if (!isCriticalUpdate) {
                    return emptyOptimisticUpdate()
                  }
                }
                // Re-throw if critical or non-rate-limit error
                throw promiseError
              }
            }

            // Create new promise for session creation
            const createPromise = (async () => {
              try {
                apiLogger.info('Session not found during update, creating session with updates', {
                  reportId,
                  note: 'Session exists in store but not in backend. Creating session with provided updates.',
                  updates: Object.keys(updates.updates || {}),
                })

                // Merge only sessionData/partialData into session_data (never spread full PATCH)
                const mergedSessionData = SessionAPI.flattenStoreAndPatchIntoSessionDataForCreate(
                  currentSession.sessionData as Record<string, unknown> | undefined,
                  updates.updates
                )

                const sessionToCreate: CreateValuationSessionInput = {
                  session_key: reportId,
                  reportId,
                  currentView:
                    currentSession.currentView ||
                    updates.updates?.currentView ||
                    currentSession.currentView ||
                    'manual',
                  sessionData: mergedSessionData,
                  name: updates.updates?.name || currentSession.name,
                  dataSource: updates.updates?.dataSource || currentSession.dataSource,
                }

                const createResponse = await this.createValuationSession(sessionToCreate, options)
                // Clear any previous errors on success
                SessionAPI.sessionCreationErrors.delete(reportId)
                return createResponse
              } catch (createError) {
                // Store error for cooldown period if it's a rate limit
                if (isHttpStatus(createError, 429)) {
                  SessionAPI.sessionCreationErrors.set(reportId, {
                    error: createError,
                    timestamp: Date.now(),
                  })
                  apiLogger.warn(
                    'Rate limit hit during session creation, storing error for cooldown',
                    {
                      reportId,
                      cooldown_ms: SessionAPI.ERROR_COOLDOWN_MS,
                    }
                  )
                }
                throw createError
              } finally {
                // Clean up promise from map after completion (success or failure)
                SessionAPI.sessionCreationPromises.delete(reportId)
              }
            })()

            // Store promise for deduplication
            SessionAPI.sessionCreationPromises.set(reportId, createPromise)

            try {
              const createResponse = await createPromise

              // Return in update format for compatibility
              return {
                success: createResponse.success,
                session: createResponse.session,
                updated: true,
              }
            } catch (createError) {
              // If creation failed, check if it's a rate limit
              if (isHttpStatus(createError, 429)) {
                // Rate limit - return optimistic success for non-critical updates
                const isCriticalUpdate = !!(
                  updates.updates?.sessionData || updates.updates?.currentView
                )
                if (!isCriticalUpdate) {
                  return emptyOptimisticUpdate()
                }
              }
              // Re-throw if critical or non-rate-limit error
              throw createError
            }
          } else {
            // ✅ TWIN ENGINE ARCHITECTURE: No session in store
            // All callers are authenticated (GuestSessionEngine never calls this)
            // Return optimistic success for non-critical updates
            const isCriticalUpdate = !!(
              updates.updates?.sessionData || updates.updates?.currentView
            )

            if (!isCriticalUpdate) {
              apiLogger.debug('Session not found during update - returning optimistic success', {
                reportId,
                isCriticalUpdate,
                note: 'Non-critical update - will be retried on next change',
              })
              return emptyOptimisticUpdate()
            }

            // For critical updates, log error but don't crash
            apiLogger.warn('Session not found during update - session does not exist in store', {
              reportId,
              note: 'Sessions are created during bootstrap. A 404 indicates the session was deleted or there is a synchronization issue.',
              errorMessage: responseMessage(axiosError) || 'Unknown error',
            })
            // Return optimistic success instead of crashing
            return emptyOptimisticUpdate()
          }
        } catch (createError) {
          // If auto-create fails, check if it's a rate limit
          if (isHttpStatus(createError, 429)) {
            // Store error for cooldown period
            SessionAPI.sessionCreationErrors.set(reportId, {
              error: createError,
              timestamp: Date.now(),
            })
            apiLogger.warn(
              'Rate limit hit during session auto-create, returning optimistic success',
              {
                reportId,
                note: 'Update will be retried after cooldown period',
                cooldown_ms: SessionAPI.ERROR_COOLDOWN_MS,
              }
            )
            // Return optimistic success for non-critical updates
            const isCriticalUpdate = !!(
              updates.updates?.sessionData || updates.updates?.currentView
            )
            if (!isCriticalUpdate) {
              return emptyOptimisticUpdate()
            }
            // For critical updates, still return optimistic success but log warning
            apiLogger.warn('Rate limit hit for critical update, returning optimistic success', {
              reportId,
              updateKeys: Object.keys(updates.updates || {}),
            })
            return emptyOptimisticUpdate()
          }

          // If auto-create fails with non-rate-limit error, log and return optimistic success
          // Don't crash the UI - guest users should be able to continue working
          apiLogger.warn('Failed to auto-create session after 404, returning optimistic success', {
            reportId,
            createError: createError instanceof Error ? createError.message : String(createError),
            originalError: responseMessage(axiosError) || 'Unknown error',
            note: 'Guest users can continue working - session will be created on explicit save',
          })
          // Return optimistic success - don't crash UI
          return emptyOptimisticUpdate()
        }
      } else {
        // Non-404/429 error - re-throw as normal
        this.handleSessionError(error, 'update session')
      }
    }
  }

  /**
   * Switch valuation view (manual ↔ conversational)
   */
  async switchValuationView(
    reportId: string,
    view: 'manual' | 'conversational',
    options?: APIRequestConfig
  ): Promise<SwitchViewResponse> {
    try {
      // Map frontend 'conversational' to backend 'ai-guided'
      const backendView = view === 'conversational' ? 'ai-guided' : view

      // Backend endpoint: /api/v2/valuations/sessions/:reportId/switch-view (POST, not PUT)
      const response = await this.executeRequest<SessionEnvelope<SessionRecord>>(
        requestConfig({
          method: 'POST',
          url: `/api/v2/valuations/sessions/${reportId}/switch-view`,
          data: { view: backendView },
          headers: {},
        }),
        options
      )

      // Backend returns { success: true, data: {...} }
      // FIX: Add null checks to prevent "Cannot read properties of undefined" errors
      if (!response.success) {
        const errorMessage = response.error || 'Failed to switch view'
        throw new APIError(errorMessage, 400, undefined, false)
      }

      const sessionData = response.data

      // FIX: Handle missing or malformed response data
      if (!sessionData || typeof sessionData !== 'object') {
        apiLogger.warn('Invalid response data from switch-view endpoint', {
          reportId,
          response,
        })
        // Return success with the requested view if data is missing
        // The optimistic update already happened, so we just confirm it
        return {
          success: true,
          currentView: view,
        }
      }

      // Map backend 'ai-guided' to frontend 'conversational'
      const currentView = normalizeSessionView(sessionData.currentView)
      const previousView =
        sessionData.previousView === 'ai-guided' || sessionData.previousView === 'conversational'
          ? normalizeSessionView(sessionData.previousView)
          : undefined

      // Map response back - previousView is optional and not always returned
      return {
        success: true,
        currentView,
        previousView,
      }
    } catch (error) {
      const appError = convertToApplicationError(error, { reportId, view })

      // Handle rate limiting gracefully (429)
      if (appError.code === 'RATE_LIMIT_ERROR' || appError.code === 'TOO_MANY_REQUESTS_ERROR') {
        apiLogger.warn('Rate limited on switch view - keeping optimistic update', {
          reportId,
          view,
          code: appError.code,
        })
        // Return success with requested view - optimistic update already happened
        // Don't throw error, just log it
        return {
          success: true,
          currentView: view,
        }
      }

      this.handleSessionError(error, 'switch view')
    }
  }

  async deleteValuationSession(
    reportId: string,
    options?: APIRequestConfig
  ): Promise<{ success: boolean; message?: string }> {
    SessionAPI.markSessionDeleted(reportId)
    SessionAPI.sessionCreationPromises.delete(reportId)
    SessionAPI.sessionCreationErrors.delete(reportId)

    try {
      const response = await this.executeRequest<{ success?: boolean; message?: string }>(
        requestConfig({
          method: 'DELETE',
          url: `/api/v2/valuations/sessions/${reportId}`,
          headers: {},
        }),
        {
          ...options,
          retry: options?.retry ?? { maxRetries: 0 },
        }
      )

      return {
        success: response?.success ?? true,
        message: response?.message,
      }
    } catch (error) {
      const axiosError = toAxiosLikeError(error)
      if (axiosError.response?.status === 404) {
        return {
          success: true,
          message: 'Session already deleted',
        }
      }
      SessionAPI.clearDeletedSessionMarker(reportId)
      this.handleSessionError(error, 'delete session')
    }
  }

  /**
   * Handle session-specific errors
   */
  private handleSessionError(error: unknown, operation: string): never {
    const appError = convertToApplicationError(error, { operation })
    const appErrorDetails = {
      message: appError.message,
      code: appError.code,
      context: appError.context,
    }

    // Log with specific error type
    if (isNetworkError(appError)) {
      apiLogger.error(`Session ${operation} failed - network error`, {
        error: appErrorDetails.message,
        code: appErrorDetails.code,
        operation,
        context: appErrorDetails.context,
      })
    } else if (isSessionConflictError(appError)) {
      apiLogger.warn(`Session ${operation} failed - conflict`, {
        error: appErrorDetails.message,
        code: appErrorDetails.code,
        operation,
        context: appErrorDetails.context,
      })
    } else if (isValidationError(appError)) {
      apiLogger.error(`Session ${operation} failed - validation error`, {
        error: appErrorDetails.message,
        code: appErrorDetails.code,
        operation,
        context: appErrorDetails.context,
      })
    } else {
      apiLogger.error(`Session ${operation} failed`, {
        error: appErrorDetails.message,
        code: appErrorDetails.code,
        operation,
        context: appErrorDetails.context,
      })
    }

    // Re-throw as appropriate error type
    if (appErrorDetails.code === 'NOT_FOUND_ERROR') {
      throw new APIError('Session not found', 404, undefined, true)
    }

    if (appErrorDetails.code === 'AUTH_ERROR' || appErrorDetails.code === 'PERMISSION_ERROR') {
      throw new AuthenticationError('Authentication required for session operation')
    }

    if (appErrorDetails.code === 'SESSION_CONFLICT') {
      throw new APIError('Session conflict - please refresh and try again', 409, undefined, true)
    }

    // Re-throw the converted error
    throw appError
  }

  /**
   * Save complete valuation package to session
   * Persists sessionData (input fields), valuation result, and HTML report for restoration
   *
   * ATOMIC SAVE: All data saved in single API call to ensure consistency
   */
  async saveValuationResult(
    reportId: string,
    data: SaveValuationResultPayload,
    options?: APIRequestConfig
  ): Promise<SaveValuationResultResponse> {
    try {
      const response = await this.executeRequest<SaveValuationResultResponse>(
        requestConfig({
          method: 'PUT',
          url: `/api/v2/valuations/sessions/${reportId}/result`,
          data: {
            sessionData: data.sessionData, // ✅ NEW: Send input data
            valuationResult: data.valuationResult,
            htmlReport: data.htmlReport,
            name: data.name, // ✅ NEW: Send custom valuation name
          },
          headers: {},
        }),
        options
      )

      apiLogger.info('Complete valuation package saved to session', {
        reportId,
        hasSessionData: !!data.sessionData,
        sessionDataKeys: data.sessionData ? Object.keys(data.sessionData) : [],
        hasValuationResult: !!data.valuationResult,
        hasHtmlReport: !!data.htmlReport,
        htmlReportLength: data.htmlReport?.length || 0,
        reportReady: response?.reportReady ?? null,
        hasSession: !!response?.session,
      })

      if (!response) {
        return {
          success: true,
          message: 'Valuation result saved',
        }
      }

      return {
        ...response,
        session: response.session
          ? normalizeBackendSessionPayload(response.session)
          : response.session,
      }
    } catch (error) {
      apiLogger.error('Failed to save valuation result to session', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      this.handleSessionError(error, 'save valuation result')
    }
  }
}
