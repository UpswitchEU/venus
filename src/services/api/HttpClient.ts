/**
 * HTTP Client Base Service
 *
 * Single Responsibility: HTTP client setup, interceptors, and request management
 * Shared foundation for all API services
 *
 * BANK-GRADE ARCHITECTURE:
 * - Correlation ID propagation for distributed tracing
 * - Idempotency key support for safe retries
 * - Request fingerprinting for deduplication
 *
 * @module services/api/HttpClient
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { CLIENT_CONTEXT_HEADERS } from '../../constants/headers'
import {
  buildAxiosEffectiveRequestUrl,
  isBySessionReportUrl,
} from '../../constants/reportBySessionRetry'
// AUTH-FIRST: useGuestSessionStore removed - guest sessions are no longer supported
import { env } from '../../utils/env'
import {
  classifyError,
  type ErrorCategory,
  getUserFriendlyErrorMessage,
} from '../../utils/errorRecovery'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { apiLogger, extractCorrelationId, setCorrelationFromResponse } from '../../utils/logger'
import { getRenderableReportHtml } from '../../utils/safetyNetReportHtml'

type UnknownRecord = Record<string, unknown>

type HttpClientRequestConfig = AxiosRequestConfig & {
  _correlationId?: string
  _customConfig?: APIRequestConfig
  _idempotencyKey?: string
  _requestStartTime?: string
}

type EnrichedHttpError = Error & {
  correlationId?: string | null
  errorCategory?: ErrorCategory
  idempotencyKey?: string
  userFriendlyMessage?: string
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asHttpClientConfig(
  config?: AxiosRequestConfig | null
): HttpClientRequestConfig | undefined {
  return config as HttpClientRequestConfig | undefined
}

function getAxiosStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

function getAxiosResponseData(error: unknown): unknown {
  return axios.isAxiosError(error) ? error.response?.data : undefined
}

function getAxiosErrorConfig(error: unknown): HttpClientRequestConfig | undefined {
  return axios.isAxiosError(error) ? asHttpClientConfig(error.config) : undefined
}

function getRecordValue(value: unknown, key: string): unknown {
  return isUnknownRecord(value) ? value[key] : undefined
}

function getStringRecordValue(value: unknown, key: string): string | undefined {
  const field = getRecordValue(value, key)
  return typeof field === 'string' ? field : undefined
}

function getObjectKeys(value: unknown): string[] {
  return isUnknownRecord(value) ? Object.keys(value) : []
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isExpectedReportBySessionNotReadyLog(error: unknown): boolean {
  const cfg = getAxiosErrorConfig(error)
  const status = getAxiosStatus(error)
  const method = String(cfg?.method ?? 'get').toUpperCase()
  if (method !== 'GET' || status !== 404) return false
  const effectiveUrl = buildAxiosEffectiveRequestUrl(cfg)
  return isBySessionReportUrl(effectiveUrl)
}

// BANK-GRADE: Client version for API compatibility tracking
const CLIENT_VERSION = '2.0.0'
const VALUATION_RESULT_HTML_OMIT_BYTES = 10 * 1024 * 1024
const VALUATION_RESULT_TOP_LEVEL_BLOB_KEYS = [
  'htmlReport',
  'html_report',
  '_htmlReport',
  'pdfHtmlReport',
  'pdf_html_report',
  '_pdfHtmlReport',
  'pdfHtml',
  'reportHtml',
] as const

/**
 * Generate a correlation ID for request tracing across services
 * Format: cid_{timestamp}_{random} for easy identification
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomUUID().split('-')[0]
  return `cid_${timestamp}_${random}`
}

/**
 * Generate an idempotency key for safe retries
 * Format: idem_{timestamp}_{random}
 */
function generateIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${crypto.randomUUID().split('-')[0]}`
}

function isValuationResultSaveConfig(config: AxiosRequestConfig): boolean {
  const method = String(config.method ?? '').toUpperCase()
  const url = String(config.url ?? '')
  return method === 'PUT' && url.includes('/api/v2/valuations/sessions/') && url.includes('/result')
}

function getConfigReportBlobLengths(config: AxiosRequestConfig): Record<string, number> {
  const data = config.data
  if (!isUnknownRecord(data)) {
    return {}
  }
  const lengths: Record<string, number> = {}
  for (const key of VALUATION_RESULT_TOP_LEVEL_BLOB_KEYS) {
    const value = data[key]
    if (typeof value === 'string' && value.length > 0) {
      lengths[key] = value.length
    }
  }
  return lengths
}

function hasConfigReportBlobs(config: AxiosRequestConfig): boolean {
  return Object.keys(getConfigReportBlobLengths(config)).length > 0
}

function estimateJsonByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value)
    if (!serialized) {
      return 0
    }
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).byteLength
    }
    return serialized.length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function withoutConfigReportBlobs(config: AxiosRequestConfig): AxiosRequestConfig | null {
  if (!isValuationResultSaveConfig(config) || !hasConfigReportBlobs(config)) {
    return null
  }
  const data = { ...(config.data as UnknownRecord) }
  for (const key of VALUATION_RESULT_TOP_LEVEL_BLOB_KEYS) {
    if (typeof data[key] === 'string') {
      data[key] = undefined
    }
  }
  return {
    ...config,
    data,
  }
}

function omitOversizedValuationResultReportBlobs(config: AxiosRequestConfig): {
  config: AxiosRequestConfig
  estimatedBodyBytes?: number
  omitted: boolean
} {
  if (!isValuationResultSaveConfig(config) || !hasConfigReportBlobs(config)) {
    return { config, omitted: false }
  }

  const estimatedBodyBytes = estimateJsonByteLength(config.data)
  if (estimatedBodyBytes <= VALUATION_RESULT_HTML_OMIT_BYTES) {
    return { config, estimatedBodyBytes, omitted: false }
  }

  return {
    config: withoutConfigReportBlobs(config) ?? config,
    estimatedBodyBytes,
    omitted: true,
  }
}

export interface APIRequestConfig {
  timeout?: number
  signal?: AbortSignal
  /** Idempotency key for safe retries (auto-generated if not provided for POST/PUT/PATCH) */
  idempotencyKey?: string
  /** Skip idempotency key generation */
  skipIdempotency?: boolean
  /**
   * GET `/reports/by-session/:key` only: cap 404 retry attempts (default = full
   * backoff table in ReportAPI). Use `1` on polling paths to avoid hammering
   * the API when no report row exists yet.
   */
  bySession404Attempts?: number
  retry?: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    backoffMultiplier?: number
    shouldRetry?: (error: unknown) => boolean
  }
}

/**
 * Base HTTP client with common interceptors and request management
 */
export class HttpClient {
  protected client: AxiosInstance
  protected activeRequests: Map<string, AbortController> = new Map()
  protected requestTimeouts: Map<string, NodeJS.Timeout> = new Map()

  constructor(baseURL?: string, defaultTimeout: number = 30000) {
    this.client = axios.create({
      baseURL: baseURL || getApiUrl(),
      timeout: defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Send authentication cookies
      // Axios bug: 204 No Content has empty body - JSON.parse('') throws "Unexpected end of JSON input"
      // See https://github.com/axios/axios/issues/6639 - handle empty body before parse
      transformResponse: [
        (data: unknown, headers?: Record<string, string>) => {
          if (data === '' || data === null || data === undefined) {
            return { success: true }
          }
          if (typeof data === 'string') {
            try {
              return JSON.parse(data)
            } catch {
              return data
            }
          }
          return data
        },
      ],
    })

    this.setupInterceptors()
  }

  /**
   * Setup common request and response interceptors
   *
   * BANK GRADE ARCHITECTURE:
   * - Correlation ID propagation for distributed tracing
   * - Idempotency keys for safe retries
   * - Sequential initialization (guaranteed order)
   * - No timeouts (guaranteed completion)
   * - Clear ownership semantics (backend decides)
   */
  private setupInterceptors(): void {
    // Request interceptor for owner headers (user/guest/client context)
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // CRITICAL: Wait for session initialization to complete
        // This guarantees auth and client context are ready before ANY API call
        try {
          const { waitForSessionReady } = await import('../../lib/sessionInitialization')
          await waitForSessionReady()
        } catch (error) {
          apiLogger.error('[HttpClient] Session initialization failed', { error })
          // Continue anyway (defensive)
        }

        // BANK-GRADE: Add correlation ID for distributed tracing
        const correlationId = generateCorrelationId()
        config.headers['X-Correlation-ID'] = correlationId
        config.headers['X-Request-ID'] = `req_${Date.now()}`
        config.headers['X-Client-Version'] = CLIENT_VERSION

        const metadataConfig = asHttpClientConfig(config)
        if (metadataConfig) {
          metadataConfig._correlationId = correlationId
        }

        // BANK-GRADE: Add idempotency key for mutating requests
        const method = config.method?.toUpperCase()
        const isMutatingRequest = method === 'POST' || method === 'PUT' || method === 'PATCH'
        const customConfig = metadataConfig?._customConfig

        if (isMutatingRequest && !customConfig?.skipIdempotency) {
          const idempotencyKey = customConfig?.idempotencyKey || generateIdempotencyKey()
          config.headers['X-Idempotency-Key'] = idempotencyKey
          if (metadataConfig) {
            metadataConfig._idempotencyKey = idempotencyKey
          }
        }

        // Get owner headers (backend will determine ownership)
        const ownerHeaders = await this.getOwnerHeaders()
        Object.assign(config.headers, ownerHeaders)

        apiLogger.debug('[HttpClient] Request headers configured', {
          correlationId,
          method,
          url: config.url,
          hasIdempotencyKey: !!config.headers['X-Idempotency-Key'],
        })

        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for correlation ID extraction and logging
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Extract correlation ID from response headers (server may echo it back)
        const serverCorrelationId = extractCorrelationId(response)
        const responseConfig = asHttpClientConfig(response.config)
        const clientCorrelationId = responseConfig?._correlationId
        const correlationId = serverCorrelationId || clientCorrelationId

        if (correlationId) {
          setCorrelationFromResponse(response)
          const requestStartTime = Number(responseConfig?._requestStartTime ?? 0)
          apiLogger.debug('[HttpClient] Request completed', {
            correlationId,
            url: response.config.url,
            method: response.config.method?.toUpperCase(),
            status: response.status,
            durationMs: requestStartTime > 0 ? Date.now() - requestStartTime : undefined,
          })
        }
        return response
      },
      (error: unknown) => {
        // Handle response errors with correlation ID and error classification
        const serverCorrelationId =
          axios.isAxiosError(error) && error.response ? extractCorrelationId(error.response) : null
        const errorConfig = getAxiosErrorConfig(error)
        const clientCorrelationId = errorConfig?._correlationId
        const correlationId = serverCorrelationId || clientCorrelationId
        const idempotencyKey = errorConfig?._idempotencyKey
        const errorCategory = classifyError(error)
        const userFriendlyMessage = getUserFriendlyErrorMessage(error, errorCategory)
        const responseData = getAxiosResponseData(error)
        const serverError =
          getRecordValue(responseData, 'error') ?? getRecordValue(responseData, 'message')

        if (isExpectedReportBySessionNotReadyLog(error)) {
          apiLogger.debug('[HttpClient] Expected report-by-session not ready (404)', {
            correlationId: correlationId || 'unknown',
            idempotencyKey: idempotencyKey || 'none',
            url: errorConfig?.url,
            method: errorConfig?.method?.toUpperCase(),
            status: getAxiosStatus(error),
          })
        } else {
          // BANK-GRADE: Always log with correlation ID for traceability
          apiLogger.error('[HttpClient] Request failed', {
            correlationId: correlationId || 'unknown',
            idempotencyKey: idempotencyKey || 'none',
            url: errorConfig?.url,
            method: errorConfig?.method?.toUpperCase(),
            status: getAxiosStatus(error),
            error: getErrorMessage(error),
            errorCategory,
            userFriendlyMessage,
            serverError,
          })
        }

        // Enhance error with correlation ID for upstream handling
        if (error instanceof Error) {
          const enrichedError = error as EnrichedHttpError
          enrichedError.correlationId = correlationId
          enrichedError.idempotencyKey = idempotencyKey
          enrichedError.userFriendlyMessage = userFriendlyMessage
          enrichedError.errorCategory = errorCategory
        }

        return Promise.reject(error)
      }
    )
  }

  /**
   * Get owner headers for request
   *
   * AUTH-FIRST: Guest session support removed.
   *
   * Priority:
   * 1. Client context (accountant-client workflow)
   * 2. Authenticated user (JWT in cookie)
   */
  private async getOwnerHeaders(): Promise<Record<string, string>> {
    try {
      // Priority 1: Client context (accountant acting on behalf of client)
      try {
        const { useClientContext } = await import('../../stores/clientContext')
        const contextHeaders = useClientContext.getState().getContextHeaders()

        if (Object.keys(contextHeaders).length > 0) {
          const clientUserId = contextHeaders[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]
          apiLogger.debug('[HttpClient] Using client context headers', {
            clientUserId: clientUserId ? `${clientUserId.substring(0, 8)}...` : 'none',
          })
          return contextHeaders
        }
      } catch (error) {
        // Non-fatal
        apiLogger.warn('[HttpClient] Failed to get client context headers', { error })
      }

      // Priority 2: Authenticated user - JWT in cookie handles auth
      // No additional headers needed
      return {}
    } catch (error) {
      apiLogger.error('[HttpClient] Failed to get owner headers', { error })
      return {}
    }
  }

  /**
   * Execute request with timeout, abort management, and retry logic
   *
   * By default, network errors and 5xx server errors are automatically retried.
   * To disable retry, pass `retry: { maxRetries: 0 }` in options.
   */
  protected async executeRequest<T>(
    config: AxiosRequestConfig,
    options?: APIRequestConfig
  ): Promise<T> {
    const prepared = omitOversizedValuationResultReportBlobs(config)
    if (prepared.omitted) {
      apiLogger.warn('[HttpClient] Omitting oversized report blobs from valuation result request', {
        url: config.url,
        estimatedBodyBytes: prepared.estimatedBodyBytes,
        limitBytes: VALUATION_RESULT_HTML_OMIT_BYTES,
        blobLengths: getConfigReportBlobLengths(config),
      })
    }

    const retryConfig = options?.retry

    // Default retry behavior: retry network errors and 5xx server errors
    // Only skip retry if explicitly disabled (maxRetries: 0)
    const runRequest = async (): Promise<T> => {
      if (retryConfig?.maxRetries === 0) {
        return this.executeSingleRequest<T>(prepared.config, options)
      }

      // Use retry logic with default config if not provided
      const effectiveRetryConfig = retryConfig || {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        shouldRetry: this.shouldRetryError.bind(this),
      }

      return this.executeRequestWithRetry<T>(prepared.config, {
        ...options,
        retry: effectiveRetryConfig,
      })
    }

    try {
      return await runRequest()
    } catch (error) {
      const retryWithoutReportBlobs = prepared.omitted ? null : withoutConfigReportBlobs(config)
      if (getAxiosStatus(error) === 413 && retryWithoutReportBlobs) {
        apiLogger.warn('[HttpClient] Retrying valuation result request without report blobs', {
          url: config.url,
          blobLengths: getConfigReportBlobLengths(config),
        })
        return this.executeRequest<T>(retryWithoutReportBlobs, {
          ...options,
          retry: { maxRetries: 0 },
        })
      }
      throw error
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeRequestWithRetry<T>(
    config: AxiosRequestConfig,
    options: APIRequestConfig
  ): Promise<T> {
    const retry = options.retry
    if (!retry) throw new Error('Retry options are required for retryable requests')

    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      shouldRetry = this.shouldRetryError,
    } = retry

    if (!options.idempotencyKey && !options.skipIdempotency) {
      options = { ...options, idempotencyKey: generateIdempotencyKey() }
    }

    let lastError: unknown

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
   * - 429 rate limit errors (HTTP status checked before classifyError so axios error messages do not block retry)
   *
   * Does NOT retry:
   * - 4xx client errors (except 408, 429)
   * - Authentication errors (401, 403)
   * - Validation errors (400)
   */
  private shouldRetryError(error: unknown): boolean {
    const status = getAxiosStatus(error)

    // Retry 429 before classifyError: message text containing "429" maps to ratelimit and would otherwise skip retry
    if (status === 429) {
      return true
    }

    const errorCategory = classifyError(error)

    // Retry network and server errors
    if (errorCategory === 'network' || errorCategory === 'server') {
      return true
    }

    // Don't retry auth or validation errors
    if (errorCategory === 'auth' || errorCategory === 'validation') {
      return false
    }

    // Don't retry message-classified rate limit without HTTP status (avoid retry loops on user-facing text)
    if (errorCategory === 'ratelimit') {
      return false
    }

    if (!axios.isAxiosError(error) || !error.response) {
      return true
    }

    // Retry on 5xx server errors
    if (typeof status === 'number' && status >= 500 && status < 600) {
      return true
    }

    if (status === 408) {
      return true
    }

    return false
  }

  /**
   * Execute single request (no retry)
   */
  private async executeSingleRequest<T>(
    config: AxiosRequestConfig,
    options?: APIRequestConfig
  ): Promise<T> {
    const timeout = options?.timeout || 30000 // Default 30 seconds for faster failure detection
    const correlationId = generateCorrelationId()

    // BANK-GRADE: Attach custom config for interceptor access
    const metadataConfig = asHttpClientConfig(config)
    if (metadataConfig) {
      metadataConfig._customConfig = options
      metadataConfig._requestStartTime = Date.now().toString()
    }

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

      // 204 No Content: Return success without parsing (belt-and-suspenders for Axios empty-body bug)
      if (response.status === 204) {
        return { success: true } as T
      }

      // Extract data from nested response structure
      // Backend returns { success: true, data: result }, so extract nested data first
      const rawData = response.data
      const nestedData = getRecordValue(rawData, 'data')
      const responseData = nestedData || rawData

      // ✅ FIX: Log response structure for valuation and session endpoints to diagnose missing html_report
      // Only flag POST /calculate endpoints as CRITICAL - GET session endpoints may not have HTML if called before PUT /result
      const isPutResultEndpoint =
        config.url?.includes('/result') && config.method?.toUpperCase() === 'PUT'
      const isCalculateEndpoint =
        config.url?.includes('/valuations/calculate') && config.method?.toUpperCase() === 'POST'
      const isSessionEndpoint = config.url?.includes('/valuation-sessions/') && !isPutResultEndpoint

      // Diagnostic logging for all valuation/session endpoints (for debugging)
      if (isCalculateEndpoint || isSessionEndpoint) {
        const extractedData = responseData
        const htmlReport = getStringRecordValue(extractedData, 'html_report')

        apiLogger.info('DIAGNOSTIC: Valuation response received', {
          url: config.url,
          method: config.method,
          endpointType: isCalculateEndpoint ? 'calculate' : 'session',
          hasRawData: !!rawData,
          rawDataType: typeof rawData,
          rawDataKeys: getObjectKeys(rawData),
          hasNestedData: !!nestedData,
          nestedDataKeys: getObjectKeys(nestedData),
          hasExtractedData: !!extractedData,
          extractedDataType: typeof extractedData,
          extractedDataKeys: getObjectKeys(extractedData),
          hasHtmlReport: !!htmlReport,
          htmlReportLength: htmlReport?.length || 0,
          htmlReportType: typeof getRecordValue(extractedData, 'html_report'),
          hasPdfUrl: !!getRecordValue(extractedData, 'pdf_url'),
          htmlReportPreview: htmlReport?.substring(0, 200) || 'N/A',
          extractionMethod: nestedData ? 'nested' : 'direct',
        })
      }

      // ✅ FIX: Only flag POST /calculate endpoints as CRITICAL if missing HTML reports
      // GET session endpoints may legitimately not have HTML if called before PUT /result completes
      if (isCalculateEndpoint) {
        const extractedData = responseData

        // CRITICAL: Warn if html_report is missing from calculation response
        const renderableHtmlReport = getRenderableReportHtml(
          getStringRecordValue(extractedData, 'html_report')
        )
        if (!renderableHtmlReport) {
          apiLogger.error('CRITICAL: html_report missing or empty in valuation response', {
            url: config.url,
            hasExtractedData: !!extractedData,
            extractedDataKeys: getObjectKeys(extractedData),
            rawResponseSample: JSON.stringify(response.data).substring(0, 1000),
            note: 'POST /calculate endpoints should always return HTML reports',
          })
        } else {
          apiLogger.info('SUCCESS: html_report found in valuation response', {
            url: config.url,
            htmlReportLength: renderableHtmlReport.length,
            htmlReportPreview: renderableHtmlReport.substring(0, 200),
          })
        }
      }

      return responseData
    } finally {
      // Cleanup
      this.activeRequests.delete(correlationId)
      const timeout = this.requestTimeouts.get(correlationId)
      if (timeout) {
        clearTimeout(timeout)
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
