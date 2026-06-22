import { describe, expect, it } from 'vitest'

import {
  calculateHttpClientRetryDelay,
  DEFAULT_HTTP_CLIENT_RETRY_CONFIG,
  resolveHttpClientRetryConfig,
  shouldRetryHttpClientError,
} from './HttpClientRetryPolicy'

function axiosStatusError(status: number, message = `Request failed with status code ${status}`) {
  return Object.assign(new Error(message), {
    isAxiosError: true as const,
    response: { status },
  })
}

describe('HttpClientRetryPolicy', () => {
  it('resolves default, disabled, and caller-provided retry configs', () => {
    expect(resolveHttpClientRetryConfig()).toBe(DEFAULT_HTTP_CLIENT_RETRY_CONFIG)
    expect(resolveHttpClientRetryConfig({ maxRetries: 0 })).toBeNull()

    const custom = { initialDelay: 250, maxRetries: 2 }
    expect(resolveHttpClientRetryConfig(custom)).toBe(custom)
  })

  it('calculates capped exponential retry delays', () => {
    expect(
      calculateHttpClientRetryDelay({
        attempt: 0,
        backoffMultiplier: 3,
        initialDelay: 100,
        maxDelay: 1000,
      })
    ).toBe(100)
    expect(
      calculateHttpClientRetryDelay({
        attempt: 2,
        backoffMultiplier: 3,
        initialDelay: 100,
        maxDelay: 1000,
      })
    ).toBe(900)
    expect(
      calculateHttpClientRetryDelay({
        attempt: 3,
        backoffMultiplier: 3,
        initialDelay: 100,
        maxDelay: 1000,
      })
    ).toBe(1000)
  })

  it('does not retry pool-pressure or gateway-timeout responses', () => {
    expect(shouldRetryHttpClientError(axiosStatusError(503))).toBe(false)
    expect(shouldRetryHttpClientError(axiosStatusError(504))).toBe(false)
  })

  it('retries status-coded rate limits, server errors, timeouts, and network failures', () => {
    expect(shouldRetryHttpClientError(axiosStatusError(429))).toBe(true)
    expect(shouldRetryHttpClientError(axiosStatusError(500))).toBe(true)
    expect(shouldRetryHttpClientError(axiosStatusError(408))).toBe(true)
    expect(
      shouldRetryHttpClientError(
        Object.assign(new Error('Network Error'), {
          isAxiosError: true as const,
        })
      )
    ).toBe(true)
  })

  it('does not retry auth, validation, or message-only rate limit errors', () => {
    expect(shouldRetryHttpClientError(axiosStatusError(401))).toBe(false)
    expect(shouldRetryHttpClientError(axiosStatusError(403))).toBe(false)
    expect(shouldRetryHttpClientError(axiosStatusError(400))).toBe(false)
    expect(shouldRetryHttpClientError(new Error('Rate limit exceeded: 429'))).toBe(false)
  })
})
