import { describe, expect, it } from 'vitest'
import {
  buildGetValuationSessionOptions,
  getValuationSessionRetryDelay,
  SESSION_GET_BASE_RETRY_DELAY_MS,
  SESSION_GET_MAX_RETRIES,
  SESSION_GET_TIMEOUT_MS,
  shouldRetryGetValuationSession,
} from './SessionApiHttp'

describe('SessionApiHttp', () => {
  it('builds GET session request options with a 30s timeout and no nested retries by default', () => {
    expect(buildGetValuationSessionOptions()).toEqual({
      timeout: SESSION_GET_TIMEOUT_MS,
      retry: { maxRetries: 0 },
    })
  })

  it('preserves caller options while enforcing the GET session timeout', () => {
    expect(
      buildGetValuationSessionOptions({
        headers: { 'x-test': '1' },
        retry: { maxRetries: 2 },
        timeout: 5_000,
      })
    ).toEqual({
      headers: { 'x-test': '1' },
      retry: { maxRetries: 2 },
      timeout: SESSION_GET_TIMEOUT_MS,
    })
  })

  it('calculates exponential GET session retry delays', () => {
    expect(getValuationSessionRetryDelay(0)).toBe(SESSION_GET_BASE_RETRY_DELAY_MS)
    expect(getValuationSessionRetryDelay(1)).toBe(SESSION_GET_BASE_RETRY_DELAY_MS * 2)
    expect(getValuationSessionRetryDelay(2)).toBe(SESSION_GET_BASE_RETRY_DELAY_MS * 4)
  })

  it('retries timeout-like GET session errors only within the configured attempt budget', () => {
    const timeoutError = { code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }

    expect(shouldRetryGetValuationSession(timeoutError, 0)).toBe(true)
    expect(shouldRetryGetValuationSession(timeoutError, SESSION_GET_MAX_RETRIES - 1)).toBe(true)
    expect(shouldRetryGetValuationSession(timeoutError, SESSION_GET_MAX_RETRIES)).toBe(false)
  })

  it('does not retry non-timeout HTTP errors through the GET session retry policy', () => {
    expect(
      shouldRetryGetValuationSession(
        { response: { status: 500 }, message: 'server unavailable' },
        0
      )
    ).toBe(false)
  })
})
