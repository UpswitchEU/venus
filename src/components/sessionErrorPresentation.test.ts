import { describe, expect, it } from 'vitest'
import {
  describeSessionError,
  parseSessionErrorCode,
  resolveSessionErrorExit,
  stripSessionErrorDiagnostics,
} from './sessionErrorPresentation'

describe('describeSessionError', () => {
  it('treats a report that cannot be opened as final: retrying repeats the refusal', () => {
    expect(describeSessionError('[REPORT_NOT_FOUND] The valuation report was not found')).toEqual({
      code: 'REPORT_NOT_FOUND',
      kind: 'report_unavailable',
      allowRetry: false,
    })
    expect(describeSessionError('[SESSION_NOT_FOUND] Session not found')?.allowRetry).toBe(false)
  })

  it('separates a refusal from a missing report', () => {
    expect(describeSessionError('[SESSION_ACCESS_DENIED] No access')).toMatchObject({
      kind: 'access_denied',
      allowRetry: false,
    })
  })

  it('offers a retry only when trying again can change the outcome', () => {
    expect(describeSessionError('[DATABASE_ERROR] Database unavailable (retryable)')).toMatchObject(
      {
        kind: 'temporary',
        allowRetry: true,
      }
    )
    expect(describeSessionError('[SOMETHING_NEW] Flaky upstream (retryable)')).toMatchObject({
      kind: 'temporary',
      allowRetry: true,
    })
  })

  it('leaves messages without a recognised code to the caller', () => {
    expect(describeSessionError('Uw sessie is verlopen')).toBeNull()
    expect(describeSessionError('[SOMETHING_NEW] Not retryable')).toBeNull()
    expect(describeSessionError(null)).toBeNull()
  })
})

describe('stripSessionErrorDiagnostics', () => {
  it('never lets the machine wrapper reach the card', () => {
    expect(
      stripSessionErrorDiagnostics('[REPORT_NOT_FOUND] The valuation report was not found')
    ).toBe('The valuation report was not found')
    expect(stripSessionErrorDiagnostics('[TIMEOUT] Took too long (retryable)')).toBe(
      'Took too long'
    )
    expect(stripSessionErrorDiagnostics('Plain sentence')).toBe('Plain sentence')
  })

  it('reads the code without being fooled by brackets later in the sentence', () => {
    expect(parseSessionErrorCode('Saving [draft] failed')).toBeNull()
    expect(parseSessionErrorCode('[AUTH_EXPIRED] Sign in again')).toBe('AUTH_EXPIRED')
  })
})

describe('resolveSessionErrorExit', () => {
  it('names the place the button really leads to', () => {
    expect(resolveSessionErrorExit({ isFromMercury: true, hasClientContext: true })).toBe('client')
    expect(resolveSessionErrorExit({ isFromMercury: true, hasClientContext: false })).toBe(
      'workspace'
    )
    expect(resolveSessionErrorExit({ isFromMercury: false, hasClientContext: true })).toBe(
      'start_over'
    )
  })
})
