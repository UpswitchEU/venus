/**
 * Session API Service
 *
 * Single Responsibility: Handle all valuation session lifecycle operations
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/session/SessionAPI
 */

import { CreateValuationSessionRequest, UpdateValuationSessionRequest } from '../../../types/api'
import type {
  CreateValuationSessionResponse,
  SaveValuationResultResponse,
  SwitchViewResponse,
  UpdateValuationSessionResponse,
  ValuationSessionResponse,
} from '../../../types/api-responses'
import { APIError, AuthenticationError, ValidationError } from '../../../types/errors'
import { convertToApplicationError } from '../../../utils/errors/errorConverter'
import {
  isNetworkError,
  isSessionConflictError,
  isValidationError,
} from '../../../utils/errors/errorGuards'
import { apiLogger } from '../../../utils/logger'
import { normalizeSessionData } from '../../session/SessionNormalizer'
import { APIRequestConfig, HttpClient } from '../HttpClient'

export class SessionAPI extends HttpClient {
  private normalizeBackendSessionPayload(sessionData: any): any {
    const payload = { ...sessionData }

    if (!payload.reportId && payload.session_key) {
      payload.reportId = payload.session_key
    }

    if (payload.view_type === 'simple' && !payload.currentView) {
      payload.currentView = 'manual'
    } else if (payload.view_type === 'advanced' && !payload.currentView) {
      payload.currentView = 'conversational'
    }

    if (payload.session_data && typeof payload.session_data === 'object') {
      const backendSessionData = payload.session_data
      payload.sessionData = payload.sessionData
        ? { ...backendSessionData, ...payload.sessionData }
        : backendSessionData
      payload.partialData = payload.partialData
        ? { ...backendSessionData, ...payload.partialData }
        : backendSessionData

      if (backendSessionData.currentView && !payload.currentView) {
        payload.currentView = backendSessionData.currentView
      }
    }

    if ((payload.currentView as string) === 'ai-guided') {
      payload.currentView = 'conversational'
    }
    if (payload.dataSource === 'ai-guided') {
      payload.dataSource = 'conversational'
    }

    const normalized = normalizeSessionData(payload)
    return {
      ...payload,
      status: payload.status ?? normalized.status,
      reportReady:
        typeof payload.reportReady === 'boolean'
          ? payload.reportReady
          : normalized.reportReady,
      valuationResult: normalized.valuationResult,
      htmlReport: normalized.htmlReport,
      _normalizedFormData: normalized.formData,
      _isNormalized: true,
    }
  }

  private static deletedSessionTombstones = new Map<string, number>()
  private static readonly DELETION_TOMBSTONE_TTL_MS = 120000

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
      const response = await this.executeRequest<any>(
        {
          method: 'GET',
          url: `/api/v2/valuations/sessions/${reportId}`,
          headers: {},
        } as any,
        timeoutOptions
      )

      // ✅ FIX: HttpClient already unwrapped the response, so response IS the session data
      // But handle edge cases where structure might be different
      let sessionData: any
      let success: boolean

      if (!response || typeof response !== 'object') {
        apiLogger.debug('Session not found - invalid response', { reportId })
        return null
      }

      // Check if response has nested data structure (edge case)
      if (
        'data' in response &&
        response.data &&
        typeof response.data === 'object' &&
        !('reportId' in response)
      ) {
        // Response is { success: true, data: {...} } - extract inner data
        sessionData = response.data
        success = (response as any).success ?? true
      } else if ('reportId' in response || 'currentView' in response) {
        // Response is the session object directly (most common case)
        sessionData = response
        success = (response as any).success ?? true
      } else {
        // Invalid structure
        apiLogger.debug('Session not found - invalid response structure', {
          reportId,
          responseKeys: Object.keys(response),
        })
        return null
      }

      if (!sessionData) {
        apiLogger.debug('Session not found', { reportId })
        return null
      }

      // Map session_key to reportId if reportId is missing
      if (!sessionData.reportId && sessionData.session_key) {
        sessionData.reportId = sessionData.session_key
      }

      // Map backend view types to frontend view types
      // Backend: 'simple' | 'advanced'
      // Frontend: 'manual' | 'conversational'
      if (sessionData.view_type === 'simple' && !sessionData.currentView) {
        sessionData.currentView = 'manual'
      } else if (sessionData.view_type === 'advanced' && !sessionData.currentView) {
        sessionData.currentView = 'conversational'
      }

      // ✅ CRITICAL FIX: Extract session_data from backend response and map to sessionData/partialData
      // Backend returns: { session_data: {...}, ... }
      // Frontend expects: { sessionData: {...}, partialData: {...}, ... }
      if (sessionData.session_data && typeof sessionData.session_data === 'object') {
        // Extract session_data and use it for both sessionData and partialData
        // sessionData is the complete merged data, partialData is for incremental updates
        const backendSessionData = sessionData.session_data

        // Map session_data to sessionData (complete data)
        if (!sessionData.sessionData) {
          sessionData.sessionData = backendSessionData
        } else {
          // Merge backend session_data into existing sessionData
          sessionData.sessionData = {
            ...backendSessionData,
            ...sessionData.sessionData, // Frontend data takes precedence
          }
        }

        // Map session_data to partialData (incremental updates)
        if (!sessionData.partialData) {
          sessionData.partialData = backendSessionData
        } else {
          // Merge backend session_data into existing partialData
          sessionData.partialData = {
            ...backendSessionData,
            ...sessionData.partialData, // Frontend data takes precedence
          }
        }

        // Also check session_data for currentView
        if (backendSessionData.currentView) {
          sessionData.currentView = backendSessionData.currentView
        }
      } else if (sessionData.session_data?.currentView) {
        // Fallback: check nested session_data for currentView
        sessionData.currentView = sessionData.session_data.currentView
      }

      // Map backend 'ai-guided' to frontend 'conversational'
      if ((sessionData.currentView as string) === 'ai-guided') {
        sessionData.currentView = 'conversational'
      }
      // Map dataSource: 'ai-guided' → 'conversational'
      if (sessionData.dataSource === 'ai-guided') {
        sessionData.dataSource = 'conversational'
      }

      // ✅ WORLD-CLASS: Normalize session data at API boundary
      // This is the SINGLE place where we convert backend naming to frontend naming
      const enrichedSessionData = this.normalizeBackendSessionPayload(sessionData)

      // Return in expected format
      return {
        success,
        session: enrichedSessionData,
      }
    } catch (error) {
      // Retry logic with exponential backoff
      const isRetryable =
        isNetworkError(error) ||
        (error as any).code === 'ECONNABORTED' ||
        (error as any).message?.includes('timeout')

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
      const axiosError = error as any

      apiLogger.error('[SessionAPI] GET session error', {
        reportId,
        status: axiosError?.response?.status,
        code: axiosError?.code,
      })

      // Handle 404 gracefully - session doesn't exist yet
      if (axiosError?.response?.status === 404) {
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
    session: CreateValuationSessionRequest | any,
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

      // Handle both CreateValuationSessionRequest and ValuationSession types
      const sessionAny = session as any

      // Map frontend view types to backend view types
      // Frontend: 'manual' | 'conversational'
      // Backend: 'simple' | 'advanced'
      const currentView = session.currentView || sessionAny.currentView || 'manual'
      const viewType = currentView === 'conversational' ? 'advanced' : 'simple'

      // Build session_data object to send to Titan
      // Titan API expects: { session_data: {...}, view_type: 'simple'|'advanced', current_step: number }
      const sessionDataPayload = {
        ...(sessionAny.sessionData || {}),
        ...(sessionAny.partialData || {}),
        // Preserve currentView in session_data for restoration
        currentView: currentView,
        ...(sessionAny.dataSource && { dataSource: sessionAny.dataSource }),
      }

      // AUTH-FIRST: Guest session handling removed - authentication is required
      // Backend will extract userId from JWT token (req.user)

      // Use reportId as session_key if session_key is not provided
      // This ensures idempotency - if a reportId exists, use it as the session_key
      const sessionKey = sessionAny.session_key || sessionAny.reportId
      SessionAPI.clearDeletedSessionMarker(sessionKey)

      const backendSession = {
        session_data: sessionDataPayload,
        view_type: viewType,
        current_step: sessionAny.current_step || 1,
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
      const sessionData = await this.executeRequest<any>(
        {
          method: 'POST',
          url: '/api/v2/valuations/sessions',
          data: backendSession,
          headers: {}, // HttpClient interceptor adds client context headers automatically
        } as any,
        options
      )

      // CRITICAL: Validate sessionData exists before accessing properties
      if (!sessionData) {
        throw new Error('Backend returned empty session data')
      }

      // Titan returns session_key, map it to reportId for Venus
      const reportId = sessionData.session_key || sessionData.reportId

      // CRITICAL: Validate required fields exist
      if (!reportId) {
        throw new Error(`Backend returned incomplete session data: missing session_key`)
      }

      // Build Venus-compatible session object
      // Titan's response: { id, session_key, session_data, view_type, status, ... }
      // Venus expects: { reportId, currentView, sessionData, ... }
      const venusSession = {
        ...sessionData,
        reportId: reportId, // Use session_key as reportId
        currentView: session.currentView || 'manual', // Preserve requested view
        sessionData: sessionData.session_data || {},
      }

      // Map backend 'ai-guided' to frontend 'conversational' (if it exists in session_data)
      if (venusSession.sessionData?.currentView === 'ai-guided') {
        venusSession.currentView = 'conversational'
      }
      if (venusSession.sessionData?.dataSource === 'ai-guided') {
        venusSession.sessionData.dataSource = 'conversational'
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
  private static sessionCreationPromises = new Map<string, Promise<any>>()
  private static sessionCreationErrors = new Map<string, { error: any; timestamp: number }>()
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
      // Map frontend 'conversational' to backend 'ai-guided'
      const updatesAny = updates.updates as any
      const mappedCurrentView =
        updates.updates?.currentView === 'conversational'
          ? 'ai-guided'
          : updates.updates?.currentView

      // Map dataSource: 'conversational' → 'ai-guided' (if present in updates)
      const mappedDataSource =
        updatesAny?.dataSource === 'conversational' ? 'ai-guided' : updatesAny?.dataSource

      const backendUpdates = {
        ...updates,
        updates: {
          ...updates.updates,
          currentView: mappedCurrentView,
          // Include mapped dataSource if it was provided in updates
          ...(updatesAny?.dataSource !== undefined && { dataSource: mappedDataSource }),
        },
      }

      // Backend endpoint: /api/v2/valuations/sessions/:reportId (PATCH, not PUT)
      const response = await this.executeRequest<{ success: boolean; data: any }>(
        {
          method: 'PATCH',
          url: `/api/v2/valuations/sessions/${reportId}`,
          data: backendUpdates.updates, // Backend expects updates directly, not wrapped
          headers: {},
        } as any,
        options
      )

      // Backend returns { success: true, data: {...} }
      // Transform to { success: true, session: {...}, updated: true }
      const sessionData = response.data

      // Map backend 'ai-guided' to frontend 'conversational'
      if (sessionData) {
        if ((sessionData.currentView as string) === 'ai-guided') {
          sessionData.currentView = 'conversational'
        }
        // Map dataSource: 'ai-guided' → 'conversational'
        if (sessionData.dataSource === 'ai-guided') {
          sessionData.dataSource = 'conversational'
        }
      }

      return {
        success: response.success,
        session: sessionData,
        updated: true,
      }
    } catch (error) {
      const axiosError = error as any

      // ✅ WORLD-CLASS FIX: Handle 429 rate limit with exponential backoff
      if (axiosError?.response?.status === 429) {
        apiLogger.warn('Rate limit hit during session update, retrying with backoff', {
          reportId,
          retryAfter: axiosError?.response?.headers?.['retry-after'],
        })

        // Use exponential backoff for rate limit retries
        const { retryWithBackoff } = await import('../../../utils/retryWithBackoff')
        try {
          // Re-define backendUpdates in retry scope
          const updatesAny = updates.updates as any
          const mappedCurrentView =
            updates.updates?.currentView === 'conversational'
              ? 'ai-guided'
              : updates.updates?.currentView
          const mappedDataSource =
            updatesAny?.dataSource === 'conversational' ? 'ai-guided' : updatesAny?.dataSource
          const retryBackendUpdates = {
            ...updates,
            updates: {
              ...updates.updates,
              currentView: mappedCurrentView,
              ...(updatesAny?.dataSource !== undefined && { dataSource: mappedDataSource }),
            },
          }

          const retriedResponse = await retryWithBackoff(
            async () => {
              return await this.executeRequest<{ success: boolean; data: any }>(
                {
                  method: 'PATCH',
                  url: `/api/v2/valuations/sessions/${reportId}`,
                  data: retryBackendUpdates.updates,
                  headers: {},
                } as any,
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

          const sessionData = retriedResponse.data
          if (sessionData) {
            if ((sessionData.currentView as string) === 'ai-guided') {
              sessionData.currentView = 'conversational'
            }
            if (sessionData.dataSource === 'ai-guided') {
              sessionData.dataSource = 'conversational'
            }
          }

          return {
            success: retriedResponse.success,
            session: sessionData,
            updated: true,
          }
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
            return {
              success: true,
              session: null as any,
              updated: false, // Indicates update was not persisted
            }
          }
          // Critical update failed - re-throw
          this.handleSessionError(retryError, 'update session')
        }
      }

      if (axiosError?.response?.status === 404) {
        // ✅ TWIN ENGINE ARCHITECTURE: Handle 404 for authenticated users only
        // GuestSessionEngine never calls this method, so all callers are authenticated
        // Check if we have session data in the store (indicating this is a real session, not deleted)
        try {
          if (SessionAPI.hasRecentDeletedSession(reportId)) {
            apiLogger.warn(
              'Skipping session auto-create because this session was just deleted',
              {
                reportId,
                tombstoneTtlMs: SessionAPI.DELETION_TOMBSTONE_TTL_MS,
              }
            )
            return {
              success: true,
              session: null as any,
              updated: false,
            }
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
                  return {
                    success: true,
                    session: null as any,
                    updated: false,
                  }
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
                const promiseAxiosError = promiseError as any
                if (promiseAxiosError?.response?.status === 429) {
                  // Rate limit - return optimistic success for non-critical updates
                  const isCriticalUpdate = !!(
                    updates.updates?.sessionData || updates.updates?.currentView
                  )
                  if (!isCriticalUpdate) {
                    return {
                      success: true,
                      session: null as any,
                      updated: false,
                    }
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

                // Create session with the updates included
                // Merge updates into sessionData (updates.updates contains the actual field updates)
                const mergedSessionData = {
                  ...(currentSession.sessionData || {}),
                  ...(updates.updates || {}),
                }

                const sessionToCreate = {
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
                } as any

                const createResponse = await this.createValuationSession(sessionToCreate, options)
                // Clear any previous errors on success
                SessionAPI.sessionCreationErrors.delete(reportId)
                return createResponse
              } catch (createError) {
                // Store error for cooldown period if it's a rate limit
                const createAxiosError = createError as any
                if (createAxiosError?.response?.status === 429) {
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
              const createAxiosError = createError as any
              if (createAxiosError?.response?.status === 429) {
                // Rate limit - return optimistic success for non-critical updates
                const isCriticalUpdate = !!(
                  updates.updates?.sessionData || updates.updates?.currentView
                )
                if (!isCriticalUpdate) {
                  return {
                    success: true,
                    session: null as any,
                    updated: false,
                  }
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
              return {
                success: true,
                session: null as any,
                updated: false,
              }
            }

            // For critical updates, log error but don't crash
            apiLogger.warn('Session not found during update - session does not exist in store', {
              reportId,
              note: 'Sessions are created during bootstrap. A 404 indicates the session was deleted or there is a synchronization issue.',
              errorMessage:
                axiosError?.response?.data?.message || axiosError?.message || 'Unknown error',
            })
            // Return optimistic success instead of crashing
            return {
              success: true,
              session: null as any,
              updated: false,
            }
          }
        } catch (createError) {
          // If auto-create fails, check if it's a rate limit
          const createAxiosError = createError as any
          if (createAxiosError?.response?.status === 429) {
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
              return {
                success: true,
                session: null as any,
                updated: false,
              }
            }
            // For critical updates, still return optimistic success but log warning
            apiLogger.warn('Rate limit hit for critical update, returning optimistic success', {
              reportId,
              updateKeys: Object.keys(updates.updates || {}),
            })
            return {
              success: true,
              session: null as any,
              updated: false,
            }
          }

          // If auto-create fails with non-rate-limit error, log and return optimistic success
          // Don't crash the UI - guest users should be able to continue working
          apiLogger.warn('Failed to auto-create session after 404, returning optimistic success', {
            reportId,
            createError: createError instanceof Error ? createError.message : String(createError),
            originalError:
              axiosError?.response?.data?.message || axiosError?.message || 'Unknown error',
            note: 'Guest users can continue working - session will be created on explicit save',
          })
          // Return optimistic success - don't crash UI
          return {
            success: true,
            session: null as any,
            updated: false,
          }
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
      const response = await this.executeRequest<{ success: boolean; data?: any }>(
        {
          method: 'POST',
          url: `/api/v2/valuations/sessions/${reportId}/switch-view`,
          data: { view: backendView },
          headers: {},
        } as any,
        options
      )

      // Backend returns { success: true, data: {...} }
      // FIX: Add null checks to prevent "Cannot read properties of undefined" errors
      if (!response || !response.success) {
        const errorMessage = (response as any)?.error || 'Failed to switch view'
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
      const currentView =
        sessionData.currentView === 'ai-guided'
          ? 'conversational'
          : sessionData.currentView === 'conversational'
            ? 'conversational'
            : 'manual'

      // Map response back - previousView is optional and not always returned
      return {
        success: true,
        currentView: currentView as 'manual' | 'conversational',
        previousView: sessionData.previousView
          ? sessionData.previousView === 'ai-guided'
            ? 'conversational'
            : sessionData.previousView
          : undefined,
      }
    } catch (error) {
      const appError = convertToApplicationError(error, { reportId, view })

      // Handle rate limiting gracefully (429)
      if (
        (appError as any).code === 'RATE_LIMIT_ERROR' ||
        (appError as any).code === 'TOO_MANY_REQUESTS_ERROR'
      ) {
        apiLogger.warn('Rate limited on switch view - keeping optimistic update', {
          reportId,
          view,
          code: (appError as any).code,
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
        {
          method: 'DELETE',
          url: `/api/v2/valuations/sessions/${reportId}`,
          headers: {},
        } as any,
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
      const axiosError = error as any
      if (axiosError?.response?.status === 404) {
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

    // Log with specific error type
    if (isNetworkError(appError)) {
      apiLogger.error(`Session ${operation} failed - network error`, {
        error: (appError as any).message,
        code: (appError as any).code,
        operation,
        context: (appError as any).context,
      })
    } else if (isSessionConflictError(appError)) {
      apiLogger.warn(`Session ${operation} failed - conflict`, {
        error: (appError as any).message,
        code: (appError as any).code,
        operation,
        context: (appError as any).context,
      })
    } else if (isValidationError(appError)) {
      apiLogger.error(`Session ${operation} failed - validation error`, {
        error: (appError as any).message,
        code: (appError as any).code,
        operation,
        context: (appError as any).context,
      })
    } else {
      apiLogger.error(`Session ${operation} failed`, {
        error: (appError as any).message,
        code: (appError as any).code,
        operation,
        context: (appError as any).context,
      })
    }

    // Re-throw as appropriate error type
    if ((appError as any).code === 'NOT_FOUND_ERROR') {
      throw new APIError('Session not found', 404, undefined, true)
    }

    if ((appError as any).code === 'AUTH_ERROR' || (appError as any).code === 'PERMISSION_ERROR') {
      throw new AuthenticationError('Authentication required for session operation')
    }

    if ((appError as any).code === 'SESSION_CONFLICT') {
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
    data: {
      sessionData?: any // ✅ NEW: Input data (form fields or collected data)
      valuationResult: any
      htmlReport?: string
      name?: string // ✅ NEW: Custom valuation name (e.g., "Amadeus report")
    },
    options?: APIRequestConfig
  ): Promise<SaveValuationResultResponse> {
    try {
      const response = await this.executeRequest<SaveValuationResultResponse>(
        {
          method: 'PUT',
          url: `/api/v2/valuations/sessions/${reportId}/result`,
          data: {
            sessionData: data.sessionData, // ✅ NEW: Send input data
            valuationResult: data.valuationResult,
            htmlReport: data.htmlReport,
            name: data.name, // ✅ NEW: Send custom valuation name
          },
          headers: {},
        } as any,
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
          ? this.normalizeBackendSessionPayload(response.session)
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
