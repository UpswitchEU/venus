/**
 * HTTP Client Base Service
 *
 * Single Responsibility: HTTP client setup, interceptors, and request management
 * Shared foundation for all API services
 *
 * BANK-GRADE ARCHITECTURE:
 * - Correlation ID propagation for distributed tracing
 * - Idempotency key support for safe retries
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
import { waitForClientContext } from '../../lib/auth'
// AUTH-FIRST: useGuestSessionStore removed - guest sessions are no longer supported
import { env } from '../../utils/env'
import {
  classifyError,
  type ErrorCategory,
  getUserFriendlyErrorMessage,
} from '../../utils/errorRecovery'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { createTraceparent, getOrCreateJourneyId } from '../../utils/journeyTrace'
import { apiLogger, extractCorrelationId, setCorrelationFromResponse } from '../../utils/logger'
import {
  getConfigBodyFieldByteLengths,
  getConfigReportBlobLengths,
  omitOversizedValuationResultReportBlobs,
  VALUATION_RESULT_HTML_OMIT_BYTES,
  withoutConfigReportBlobs,
} from './HttpClientPayloadGuards'
import { createManagedRequestLifecycle } from './HttpClientRequestLifecycle'
import {
  extractHttpResponseData,
  logValuationResponseDiagnostics,
} from './HttpClientResponseDiagnostics'
import {
  calculateHttpClientRetryDelay,
  type HttpClientRetryConfig,
  resolveHttpClientRetryConfig,
  shouldRetryHttpClientError,
} from './HttpClientRetryPolicy'

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
  retry?: HttpClientRetryConfig
}

/**
 * Base HTTP client with common interceptors and request management
 */
export class HttpClient {
  protected client: AxiosInstance
  protected activeRequests: Map<string, AbortController> = new Map()
  protected requestTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()

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
   * - Explicit transport timeouts with cleanup
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
        config.headers['X-Journey-ID'] = getOrCreateJourneyId()
        config.headers.traceparent = createTraceparent()
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
        await waitForClientContext()
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
        // Per-field breakdown so we can identify the bloater when the html
        // blobs alone are tiny (typically sessionData / valuationResult).
        fieldByteLengths: getConfigBodyFieldByteLengths(config),
      })
    }

    const retryConfig = options?.retry

    // Default retry behavior: retry network errors and 5xx server errors
    // Only skip retry if explicitly disabled (maxRetries: 0)
    const runRequest = async (): Promise<T> => {
      const effectiveRetryConfig = resolveHttpClientRetryConfig(retryConfig)
      if (!effectiveRetryConfig) {
        return this.executeSingleRequest<T>(prepared.config, options)
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
          fieldByteLengths: getConfigBodyFieldByteLengths(config),
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
      shouldRetry = this.shouldRetryError.bind(this),
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

        const delay = calculateHttpClientRetryDelay({
          attempt,
          backoffMultiplier,
          initialDelay,
          maxDelay,
        })

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

  private shouldRetryError(error: unknown): boolean {
    // Pool-pressure / BFF timeout responses (status === 503 || status === 504)
    // should never retry; the tested policy module owns the full matrix.
    return shouldRetryHttpClientError(error)
  }

  /**
   * Execute single request (no retry)
   */
  private async executeSingleRequest<T>(
    config: AxiosRequestConfig,
    options?: APIRequestConfig
  ): Promise<T> {
    const timeout = options?.timeout ?? 30000 // Default 30 seconds for faster failure detection
    const correlationId = generateCorrelationId()

    // BANK-GRADE: Attach custom config for interceptor access
    const metadataConfig = asHttpClientConfig(config)
    if (metadataConfig) {
      metadataConfig._customConfig = options
      metadataConfig._requestStartTime = Date.now().toString()
    }

    const requestTimeout = timeout
    const lifecycle = createManagedRequestLifecycle({
      externalSignal: options?.signal,
      onTimeout: () => {
        apiLogger.warn('Request timeout, aborting', { correlationId, timeout: requestTimeout })
      },
      timeoutMs: requestTimeout,
    })
    this.activeRequests.set(correlationId, lifecycle.controller)
    this.requestTimeouts.set(correlationId, lifecycle.timeoutId)

    try {
      apiLogger.debug('Making API request', {
        correlationId,
        url: config.url,
        method: config.method,
        timeout: requestTimeout,
      })

      const response = await this.client.request({
        ...config,
        signal: lifecycle.signal,
        timeout: requestTimeout,
      })

      // 204 No Content: Return success without parsing (belt-and-suspenders for Axios empty-body bug)
      if (response.status === 204) {
        return { success: true } as T
      }

      const rawData = response.data
      const { nestedData, responseData } = extractHttpResponseData(rawData)
      logValuationResponseDiagnostics({ config, nestedData, rawData, responseData })

      return responseData as T
    } finally {
      // Cleanup
      this.activeRequests.delete(correlationId)
      this.requestTimeouts.delete(correlationId)
      lifecycle.cleanup()
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
