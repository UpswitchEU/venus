import axios from 'axios'

import { classifyError } from '../../utils/errorRecovery'

export interface HttpClientRetryConfig {
  backoffMultiplier?: number
  initialDelay?: number
  maxDelay?: number
  maxRetries?: number
  shouldRetry?: (error: unknown) => boolean
}

export const DEFAULT_HTTP_CLIENT_RETRY_CONFIG: Required<HttpClientRetryConfig> = {
  backoffMultiplier: 2,
  initialDelay: 1000,
  maxDelay: 10000,
  maxRetries: 3,
  shouldRetry: shouldRetryHttpClientError,
}

function getAxiosStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export function resolveHttpClientRetryConfig(
  retryConfig?: HttpClientRetryConfig
): HttpClientRetryConfig | null {
  if (retryConfig?.maxRetries === 0) {
    return null
  }

  return retryConfig || DEFAULT_HTTP_CLIENT_RETRY_CONFIG
}

export function calculateHttpClientRetryDelay({
  attempt,
  backoffMultiplier = DEFAULT_HTTP_CLIENT_RETRY_CONFIG.backoffMultiplier,
  initialDelay = DEFAULT_HTTP_CLIENT_RETRY_CONFIG.initialDelay,
  maxDelay = DEFAULT_HTTP_CLIENT_RETRY_CONFIG.maxDelay,
}: {
  attempt: number
  backoffMultiplier?: number
  initialDelay?: number
  maxDelay?: number
}): number {
  return Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay)
}

/**
 * Default retry predicate for idempotent transport retries.
 *
 * Pool pressure and gateway timeout responses are intentionally excluded so
 * clients do not amplify already-degraded upstream capacity.
 */
export function shouldRetryHttpClientError(error: unknown): boolean {
  const status = getAxiosStatus(error)

  if (status === 503 || status === 504) {
    return false
  }

  if (status === 429) {
    return true
  }

  const errorCategory = classifyError(error)

  if (errorCategory === 'network' || errorCategory === 'server') {
    return true
  }

  if (errorCategory === 'auth' || errorCategory === 'validation') {
    return false
  }

  if (errorCategory === 'ratelimit') {
    return false
  }

  if (!axios.isAxiosError(error) || !error.response) {
    return true
  }

  if (typeof status === 'number' && status >= 500 && status < 600) {
    return true
  }

  if (status === 408) {
    return true
  }

  return false
}
