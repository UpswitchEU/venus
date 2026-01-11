/**
 * HTTP Client Base Service
 *
 * Single Responsibility: HTTP client setup, interceptors, and request management
 * Shared foundation for all API services
 *
 * @module services/api/HttpClient
 */

import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useGuestSessionStore } from '../../store/useGuestSessionStore'
import { env } from '../../utils/env'
import { apiLogger, extractCorrelationId, setCorrelationFromResponse } from '../../utils/logger'
import { classifyError, getUserFriendlyErrorMessage, defaultShouldRetry } from '../../utils/errorRecovery'

export interface APIRequestConfig {
  timeout?: number
  signal?: AbortSignal
  retry?: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    backoffMultiplier?: number
    shouldRetry?: (error: any) => boolean
  }
}

/**
 * Base HTTP client with common interceptors and request management
 */
export class HttpClient {
  protected client: AxiosInstance
  protected activeRequests: Map<string, AbortController> = new Map()
  protected requestTimeouts: Map<string, NodeJS.Timeout> = new Map()

  constructor(baseURL?: string, defaultTimeout: number = 90000) {
    this.client = axios.create({
      baseURL:
        baseURL ||
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        env.NEXT_PUBLIC_BACKEND_URL ||
        env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app',
      timeout: defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Send authentication cookies
    })

    this.setupInterceptors()
  }

  /**
   * Setup common request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for guest session tracking and client context
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Add client context headers if present
        try {
          const { useClientContext } = await import('../../stores/clientContext')
          const contextHeaders = useClientContext.getState().getContextHeaders()
          
          if (Object.keys(contextHeaders).length > 0) {
            // Merge headers properly for Axios
            Object.assign(config.headers, contextHeaders)
            
            if (process.env.NODE_ENV === 'development') {
              apiLogger.debug('Added client context headers to request', {
                headers: Object.keys(contextHeaders),
              })
            }
          }
        } catch (contextError) {
          // Non-fatal - continue without client context
          apiLogger.warn('Failed to add client context headers', { error: contextError })
        }

        // CRITICAL: Check if user is authenticated first
        // Only send guest_session_id for non-authenticated users
        try {
          const { useAuthStore } = await import('../../lib/auth')
          const user = useAuthStore.getState().user
          
          // If user is authenticated, DO NOT send guest_session_id
          // Backend will use user_id from HttpOnly cookie
          if (user) {
            apiLogger.debug('User authenticated, skipping guest session tracking', {
              userId: user.id.substring(0, 8) + '...',
            })
            return config
          }
        } catch (authError) {
          // If auth check fails, continue with guest session logic
          apiLogger.warn('Failed to check auth state, continuing with guest session logic', { error: authError })
        }

        // User is NOT authenticated - use guest session tracking
        const { getSessionId, ensureSession } = useGuestSessionStore.getState()

        // Check synchronously first (Zustand store syncs with localStorage)
        let sessionId = getSessionId()

        // If no session exists, ensure one is created (atomic operation via Zustand)
        // This prevents race conditions when multiple requests fire simultaneously
        if (!sessionId) {
          try {
            sessionId = await ensureSession()
          } catch (error) {
            apiLogger.warn('Failed to ensure guest session', { error })
            // Don't block request if session creation fails
            return config
          }
        }

        // Add session ID to request if we have one
        if (sessionId) {
          try {
            // For GET requests: add as query parameter (no CORS preflight needed)
            // For POST/PUT/PATCH: add to request body
            if (config.method === 'get' || config.method === 'GET') {
              config.params = config.params || {}
              config.params.guest_session_id = sessionId
            } else if (config.data) {
              config.data = {
                ...config.data,
                guest_session_id: sessionId,
              }
            }

            // Also add to headers for backward compatibility (if backend supports it)
            config.headers = config.headers || {}
            config.headers['x-guest-session-id'] = sessionId
            
            apiLogger.debug('Guest session ID added to request', {
              guestSessionId: sessionId.substring(0, 15) + '...',
              method: config.method,
            })
          } catch (error) {
            apiLogger.warn('Failed to add guest session to request', { error })
            // Don't block request if session tracking fails
          }
        }

        // Update session activity (safe, throttled, and circuit-breaker protected)
        // Fire and forget - don't await to avoid blocking requests
        // Note: Still using service for activity updates (non-critical, already throttled)
        import('../guestSessionService')
          .then(({ guestSessionService }) => {
            guestSessionService.updateActivity().catch(() => {
              // Errors are handled internally by updateActivity - this is just a safety net
            })
          })
          .catch((error) => {
            // Silently fail if module import fails - activity tracking is non-critical
            apiLogger.debug('Failed to import guestSessionService for activity tracking', { error })
          })

        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for correlation ID extraction and logging
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Extract correlation ID from response headers
        const correlationId = extractCorrelationId(response)
        if (correlationId) {
          setCorrelationFromResponse(response)
          apiLogger.debug('Correlation ID extracted from response', {
            correlationId,
            url: response.config.url,
            status: response.status,
          })
        }
        return response
      },
      (error) => {
        // Handle response errors with correlation ID and error classification
        const correlationId = error.config ? extractCorrelationId(error.response) : null
        const errorCategory = classifyError(error)
        const userFriendlyMessage = getUserFriendlyErrorMessage(error, errorCategory)
        
        if (correlationId) {
          apiLogger.error('API request failed with correlation ID', {
            correlationId,
            url: error.config?.url,
            status: error.response?.status,
            error: error.message,
            errorCategory,
            userFriendlyMessage,
          })
        }
        
        // Enhance error with user-friendly message and category
        if (error instanceof Error) {
          ;(error as any).userFriendlyMessage = userFriendlyMessage
          ;(error as any).errorCategory = errorCategory
        }
        
        return Promise.reject(error)
      }
    )
  }

  /**
   * Execute request with timeout, abort management, and retry logic
   *
   * By default, network errors and 5xx server errors are automatically retried.
   * To disable retry, pass `retry: { maxRetries: 0 }` in options.
   */
  protected async executeRequest<T>(
    config: InternalAxiosRequestConfig,
    options?: APIRequestConfig
  ): Promise<T> {
    const retryConfig = options?.retry

    // Default retry behavior: retry network errors and 5xx server errors
    // Only skip retry if explicitly disabled (maxRetries: 0)
    if (retryConfig?.maxRetries === 0) {
      return this.executeSingleRequest<T>(config, options)
    }

    // Use retry logic with default config if not provided
    const effectiveRetryConfig = retryConfig || {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      shouldRetry: this.shouldRetryError.bind(this),
    }

    return this.executeRequestWithRetry<T>(config, {
      ...options,
      retry: effectiveRetryConfig,
    })
  }

  /**
   * Execute request with retry logic
   */
  private async executeRequestWithRetry<T>(
    config: InternalAxiosRequestConfig,
    options: APIRequestConfig
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      shouldRetry = this.shouldRetryError,
    } = options.retry!

    let lastError: any

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          apiLogger.info('Retrying API request', {
            attempt,
            maxRetries,
            url: config.url,
            method: config.method,
          })
        }

        return await this.executeSingleRequest<T>(config, {
          ...options,
          retry: undefined, // Remove retry config to avoid infinite recursion
        })
      } catch (error) {
        lastError = error

        // Check if we should retry this error
        if (!shouldRetry(error) || attempt >= maxRetries) {
          throw error
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay)

        apiLogger.warn('API request failed, retrying', {
          attempt,
          maxRetries,
          delay,
          url: config.url,
          error: error instanceof Error ? error.message : String(error),
        })

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  /**
   * Default retry predicate - retry on network errors and 5xx server errors
   *
   * World-Class Retry Logic:
   * - Uses error classification for intelligent retry decisions
   * - Retries network and server errors
   * - Does NOT retry auth/validation errors
   *
   * Retries:
   * - Network errors (no response)
   * - 5xx server errors
   * - 408 timeout errors
   * - 429 rate limit errors (with longer backoff)
   *
   * Does NOT retry:
   * - 4xx client errors (except 408, 429)
   * - Authentication errors (401, 403)
   * - Validation errors (400)
   */
  private shouldRetryError(error: any): boolean {
    // Use error classification for intelligent retry decisions
    const errorCategory = classifyError(error)
    
    // Retry network and server errors
    if (errorCategory === 'network' || errorCategory === 'server') {
      return true
    }
    
    // Don't retry auth or validation errors
    if (errorCategory === 'auth' || errorCategory === 'validation') {
      return false
    }
    
    // Fallback to status-based check for unknown errors
    if (!error.response) {
      return true // Network error
    }

    const status = error.response?.status

    // Retry on 5xx server errors
    if (status >= 500 && status < 600) {
      return true
    }

    // Retry on timeout errors
    if (status === 408) {
      return true
    }

    // Retry on rate limit errors (will use longer backoff)
    if (status === 429) {
      return true
    }

    // Don't retry on client errors (4xx) except 408, 429
    return false
  }

  /**
   * Execute single request (no retry)
   */
  private async executeSingleRequest<T>(
    config: InternalAxiosRequestConfig,
    options?: APIRequestConfig
  ): Promise<T> {
    const timeout = options?.timeout || 90000 // Default 90 seconds
    const correlationId = Math.random().toString(36).substring(2, 15)

    // Check for duplicate request
    if (this.activeRequests.has(correlationId)) {
      apiLogger.warn('Duplicate request detected, cancelling previous', { correlationId })
      this.activeRequests.get(correlationId)?.abort()
    }

    // Create AbortController for this request
    const controller = new AbortController()
    this.activeRequests.set(correlationId, controller)

    // Use provided signal or create new one
    const signal = options?.signal || controller.signal

    // Set up timeout
    const requestTimeout = timeout
    const timeoutId = setTimeout(() => {
      apiLogger.warn('Request timeout, aborting', { correlationId, timeout: requestTimeout })
      controller.abort()
    }, requestTimeout)
    this.requestTimeouts.set(correlationId, timeoutId)

    try {
      apiLogger.debug('Making API request', {
        correlationId,
        url: config.url,
        method: config.method,
        timeout: requestTimeout,
      })

      const response = await this.client.request({
        ...config,
        signal,
      })

      // Extract data from nested response structure
      // Backend returns { success: true, data: result }, so extract nested data first
      const responseData = response.data?.data || response.data

      // ✅ FIX: Log response structure for valuation and session endpoints to diagnose missing html_report
      // Only flag POST /calculate endpoints as CRITICAL - GET session endpoints may not have HTML if called before PUT /result
      const isPutResultEndpoint =
        config.url?.includes('/result') && config.method?.toUpperCase() === 'PUT'
      const isCalculateEndpoint =
        config.url?.includes('/valuations/calculate') && config.method?.toUpperCase() === 'POST'
      const isSessionEndpoint = config.url?.includes('/valuation-sessions/') && !isPutResultEndpoint

      // Diagnostic logging for all valuation/session endpoints (for debugging)
      if (isCalculateEndpoint || isSessionEndpoint) {
        const rawData = response.data
        const nestedData = (rawData as any)?.data
        const extractedData = responseData

        apiLogger.info('DIAGNOSTIC: Valuation response received', {
          url: config.url,
          method: config.method,
          endpointType: isCalculateEndpoint ? 'calculate' : 'session',
          hasRawData: !!rawData,
          rawDataType: typeof rawData,
          rawDataKeys: rawData ? Object.keys(rawData) : [],
          hasNestedData: !!nestedData,
          nestedDataKeys: nestedData ? Object.keys(nestedData) : [],
          hasExtractedData: !!extractedData,
          extractedDataType: typeof extractedData,
          extractedDataKeys: extractedData ? Object.keys(extractedData) : [],
          hasHtmlReport: !!(extractedData as any)?.html_report,
          htmlReportLength: (extractedData as any)?.html_report?.length || 0,
          htmlReportType: typeof (extractedData as any)?.html_report,
          hasInfoTabHtml: !!(extractedData as any)?.info_tab_html,
          infoTabHtmlLength: (extractedData as any)?.info_tab_html?.length || 0,
          htmlReportPreview: (extractedData as any)?.html_report?.substring(0, 200) || 'N/A',
          extractionMethod: rawData?.data ? 'nested' : 'direct',
        })
      }

      // ✅ FIX: Only flag POST /calculate endpoints as CRITICAL if missing HTML reports
      // GET session endpoints may legitimately not have HTML if called before PUT /result completes
      if (isCalculateEndpoint) {
        const extractedData = responseData

        // CRITICAL: Warn if html_report is missing from calculation response
        if (
          !(extractedData as any)?.html_report ||
          (extractedData as any).html_report.trim().length === 0
        ) {
          apiLogger.error('CRITICAL: html_report missing or empty in valuation response', {
            url: config.url,
            hasExtractedData: !!extractedData,
            extractedDataKeys: extractedData ? Object.keys(extractedData) : [],
            rawResponseSample: JSON.stringify(response.data).substring(0, 1000),
            note: 'POST /calculate endpoints should always return HTML reports',
          })
        } else {
          apiLogger.info('SUCCESS: html_report found in valuation response', {
            url: config.url,
            htmlReportLength: (extractedData as any)?.html_report?.length || 0,
            htmlReportPreview: (extractedData as any)?.html_report?.substring(0, 200),
          })
        }

        // CRITICAL: Warn if info_tab_html is missing from calculation response
        if (
          !(extractedData as any)?.info_tab_html ||
          (extractedData as any).info_tab_html.trim().length === 0
        ) {
          apiLogger.error('CRITICAL: info_tab_html missing or empty in valuation response', {
            url: config.url,
            hasExtractedData: !!extractedData,
            extractedDataKeys: extractedData ? Object.keys(extractedData) : [],
            hasHtmlReport: !!(extractedData as any)?.html_report,
            htmlReportLength: (extractedData as any)?.html_report?.length || 0,
            rawResponseSample: JSON.stringify(response.data).substring(0, 1000),
            note: 'POST /calculate endpoints should always return HTML reports',
          })
        } else {
          apiLogger.info('SUCCESS: info_tab_html found in valuation response', {
            url: config.url,
            infoTabHtmlLength: (extractedData as any)?.info_tab_html?.length || 0,
            infoTabHtmlPreview: (extractedData as any)?.info_tab_html?.substring(0, 200),
          })
        }
      }

      return responseData
    } finally {
      // Cleanup
      this.activeRequests.delete(correlationId)
      if (this.requestTimeouts.has(correlationId)) {
        clearTimeout(this.requestTimeouts.get(correlationId)!)
        this.requestTimeouts.delete(correlationId)
      }
    }
  }

  /**
   * Clean up all active requests (useful for component unmount)
   */
  cleanup(): void {
    // Abort all active requests
    for (const [correlationId, controller] of this.activeRequests) {
      apiLogger.debug('Cleaning up active request', { correlationId })
      controller.abort()
    }
    this.activeRequests.clear()

    // Clear all timeouts
    for (const [_correlationId, timeoutId] of this.requestTimeouts) {
      clearTimeout(timeoutId)
    }
    this.requestTimeouts.clear()
  }
}
