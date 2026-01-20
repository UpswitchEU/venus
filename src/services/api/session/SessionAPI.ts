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
import { APIRequestConfig, HttpClient } from '../HttpClient'

export class SessionAPI extends HttpClient {
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

      // DIAGNOSTIC: Log what we received and parsed
      console.log('[SessionAPI] GET response received and parsed:', {
        reportId,
        hasResponse: !!response,
        responseType: typeof response,
        responseKeys: response ? Object.keys(response) : [],
        hasSessionData: !!sessionData,
        sessionDataKeys: sessionData ? Object.keys(sessionData) : [],
        hasHtmlReport: !!(sessionData as any)?.htmlReport,
        htmlReportLength: (sessionData as any)?.htmlReport?.length || 0,
        hasInfoTabHtml: !!(sessionData as any)?.infoTabHtml,
        infoTabHtmlLength: (sessionData as any)?.infoTabHtml?.length || 0,
        hasValuationResult: !!(sessionData as any)?.valuationResult,
      })

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

      // ✅ DIAGNOSTIC: Log what we're returning (including sessionData/partialData mapping)
      console.log('[SessionAPI] GET returning session:', {
        reportId,
        hasSession: !!sessionData,
        sessionKeys: sessionData ? Object.keys(sessionData) : [],
        hasSessionData: !!sessionData.sessionData,
        sessionDataKeys: sessionData.sessionData ? Object.keys(sessionData.sessionData) : [],
        hasPartialData: !!sessionData.partialData,
        partialDataKeys: sessionData.partialData ? Object.keys(sessionData.partialData) : [],
        hasBackendSessionData: !!sessionData.session_data,
        backendSessionDataKeys: sessionData.session_data ? Object.keys(sessionData.session_data) : [],
        hasHtmlReport: !!(sessionData as any)?.htmlReport,
        htmlReportLength: (sessionData as any)?.htmlReport?.length || 0,
        hasInfoTabHtml: !!(sessionData as any)?.infoTabHtml,
        infoTabHtmlLength: (sessionData as any)?.infoTabHtml?.length || 0,
        hasValuationResult: !!(sessionData as any)?.valuationResult,
      })

      // Return in expected format
      return {
        success,
        session: sessionData,
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

      // DIAGNOSTIC: Log the error in detail
      console.error('[SessionAPI] GET session error:', {
        reportId,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        hasResponse: !!axiosError?.response,
        responseStatus: axiosError?.response?.status,
        responseData: axiosError?.response?.data,
        errorMessage: axiosError?.message,
        errorCode: axiosError?.code,
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
   * Handles both CreateValuationSessionRequest and ValuationSession types.
   * Maps frontend 'conversational' to backend 'ai-guided' for both currentView and dataSource.
   */
  async createValuationSession(
    session: CreateValuationSessionRequest | any,
    options?: APIRequestConfig
  ): Promise<CreateValuationSessionResponse> {
    try {
      // BANK GRADE FIX: Log timing information for race condition detection
      const { useClientContext } = await import('../../../stores/clientContext')
      const context = useClientContext.getState()
      
      apiLogger.info('[SessionAPI] Creating session', {
        hasClientContext: context.isActingAsClient,
        clientContextHeaders: Object.keys(context.getContextHeaders()).length,
        timestamp: Date.now(),
        note: 'Timing information for race condition detection'
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

      // ✅ CRITICAL: Check client context first - if it exists, don't use guest session
      // Backend will reject requests with both client context and guest_session_id
      let guestSessionId: string | undefined = undefined
      try {
        const { useClientContext } = await import('../../../stores/clientContext')
        const clientContext = useClientContext.getState()
        
        // If client context exists, don't use guest session (backend will reject it)
        if (clientContext.isActingAsClient && clientContext.client && clientContext.accountant) {
          apiLogger.debug('[SessionAPI] Client context exists, skipping guest session', {
            clientUserId: clientContext.client.id.substring(0, 8) + '...',
            accountantUserId: clientContext.accountant.id.substring(0, 8) + '...',
          })
          guestSessionId = undefined
        } else {
          // Only get guest session if no client context
          const { useAuthStore } = await import('../../../lib/auth')
          const user = useAuthStore.getState().user
          
          // Only get guest session if user is NOT authenticated
          // If user IS authenticated, backend will extract userId from JWT token (req.user)
          if (!user) {
            try {
              const { useGuestSessionStore } = await import('../../../store/useGuestSessionStore')
              // Use ensureSession to create one if it doesn't exist
              guestSessionId = await useGuestSessionStore.getState().ensureSession() || undefined
            } catch (guestError) {
              // If guest session creation fails, continue without it
              // Backend will return validation error which we'll handle
              apiLogger.warn('Failed to get guest session for session creation', { error: guestError })
            }
          }
          // If user IS authenticated, don't set guestSessionId - backend will use userId from JWT
        }
      } catch (contextError) {
        // If client context check fails, fallback to guest session logic
        try {
          const { useAuthStore } = await import('../../../lib/auth')
          const user = useAuthStore.getState().user
          
          if (!user) {
            try {
              const { useGuestSessionStore } = await import('../../../store/useGuestSessionStore')
              guestSessionId = await useGuestSessionStore.getState().ensureSession() || undefined
            } catch (guestError) {
              // Silently continue - guest_session_id is optional if user is authenticated
              apiLogger.debug('Could not determine auth state or get guest session', { contextError, guestError })
            }
          }
        } catch (authError) {
          apiLogger.debug('Could not determine auth state or get guest session', { contextError, authError })
        }
      }

      // ✅ CRITICAL FIX: Use reportId as session_key if session_key is not provided
      // This ensures idempotency - if a reportId exists, use it as the session_key
      // This prevents duplicate sessions when creating sessions with a known reportId
      const sessionKey = sessionAny.session_key || sessionAny.reportId

      const backendSession = {
        session_data: sessionDataPayload,
        view_type: viewType,
        current_step: sessionAny.current_step || 1,
        // Also send currentView at top level for DTO transformation
        currentView: currentView,
        // ✅ CRITICAL FIX: Always include session_key if available (from session_key or reportId)
        // This ensures idempotency and prevents duplicate sessions
        ...(sessionKey && { session_key: sessionKey }),
        // ✅ FIX: Include guest_session_id if available (for anonymous users)
        ...(guestSessionId && { guest_session_id: guestSessionId }),
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
   * Update existing valuation session
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
      if (axiosError?.response?.status === 404) {
        // ✅ FIX: Handle 404 gracefully - session might not exist yet during bootstrap/restore
        // Check if we have session data in the store (indicating this is a real session, not deleted)
        try {
          const { useSessionStore } = await import('../../../store/useSessionStore')
          const sessionStore = useSessionStore.getState()
          const currentSession = sessionStore.session
          
          // Only auto-create if:
          // 1. We have a session in the store with matching reportId
          // 2. The update is non-critical (like name updates)
          // 3. We're not trying to update a deleted session
          if (currentSession && currentSession.reportId === reportId) {
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
              currentView: currentSession.currentView || updates.updates?.currentView || currentSession.currentView || 'manual',
              sessionData: mergedSessionData,
              name: updates.updates?.name || currentSession.name,
              dataSource: updates.updates?.dataSource || currentSession.dataSource,
            } as any
            
            const createResponse = await this.createValuationSession(sessionToCreate, options)
            
            // Return in update format for compatibility
            return {
              success: createResponse.success,
              session: createResponse.session,
              updated: true,
            }
          } else {
            // No session in store - this is a real error
            apiLogger.error('Session not found during update - session does not exist in store', {
              reportId,
              note: 'Sessions are created during bootstrap. A 404 indicates the session was deleted or there is a synchronization issue.',
              errorMessage: axiosError?.response?.data?.message || axiosError?.message || 'Unknown error',
            })
            // Re-throw error - let error handlers deal with it
            this.handleSessionError(error, 'update session')
          }
        } catch (createError) {
          // If auto-create fails, log and re-throw original error
          apiLogger.error('Failed to auto-create session after 404', {
            reportId,
            createError: createError instanceof Error ? createError.message : String(createError),
            originalError: axiosError?.response?.data?.message || axiosError?.message || 'Unknown error',
          })
          // Re-throw original error
          this.handleSessionError(error, 'update session')
        }
      } else {
        // Non-404 error - re-throw as normal
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
   * Persists sessionData (input fields), valuation result, HTML report, and info tab HTML for restoration
   *
   * ATOMIC SAVE: All data saved in single API call to ensure consistency
   */
  async saveValuationResult(
    reportId: string,
    data: {
      sessionData?: any // ✅ NEW: Input data (form fields or collected data)
      valuationResult: any
      htmlReport?: string
      infoTabHtml?: string
      name?: string // ✅ NEW: Custom valuation name (e.g., "Amadeus report")
    },
    options?: APIRequestConfig
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[SessionAPI] DIAGNOSTIC: saveValuationResult called', {
        reportId,
        hasSessionData: !!data.sessionData,
        hasValuationResult: !!data.valuationResult,
        hasHtmlReport: !!data.htmlReport,
        htmlReportLength: data.htmlReport?.length || 0,
        hasInfoTabHtml: !!data.infoTabHtml,
        infoTabHtmlLength: data.infoTabHtml?.length || 0,
        hasName: !!data.name,
        name: data.name || undefined,
      })

      const response = await this.executeRequest<{ success: boolean; message: string }>(
        {
          method: 'PUT',
          url: `/api/v2/valuations/sessions/${reportId}/result`,
          data: {
            sessionData: data.sessionData, // ✅ NEW: Send input data
            valuationResult: data.valuationResult,
            htmlReport: data.htmlReport,
            infoTabHtml: data.infoTabHtml,
            name: data.name, // ✅ NEW: Send custom valuation name
          },
          headers: {},
        } as any,
        options
      )

      console.log('[SessionAPI] DIAGNOSTIC: PUT /result succeeded', {
        reportId,
        responseSuccess: response?.success,
      })

      apiLogger.info('Complete valuation package saved to session', {
        reportId,
        hasSessionData: !!data.sessionData,
        sessionDataKeys: data.sessionData ? Object.keys(data.sessionData) : [],
        hasValuationResult: !!data.valuationResult,
        hasHtmlReport: !!data.htmlReport,
        htmlReportLength: data.htmlReport?.length || 0,
        hasInfoTabHtml: !!data.infoTabHtml,
        infoTabHtmlLength: data.infoTabHtml?.length || 0,
      })

      return response
    } catch (error) {
      console.error('[SessionAPI] DIAGNOSTIC: PUT /result FAILED', {
        reportId,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      })

      apiLogger.error('Failed to save valuation result to session', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      this.handleSessionError(error, 'save valuation result')
    }
  }
}
