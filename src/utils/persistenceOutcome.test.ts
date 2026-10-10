import { describe, expect, it } from 'vitest'
import { persistenceFailure, requirePersistenceAcknowledgement } from './persistenceOutcome'

describe('structured persistence failures', () => {
  it('retains backend facts through nested application/transport wrappers', () => {
    const error = Object.assign(new Error('Failed to save session'), {
      context: {
        originalError: {
          response: {
            status: 503,
            headers: { 'retry-after': '24' },
            data: { details: { code: 'ADVISORY_VERIFICATION_UNAVAILABLE' } },
          },
        },
      },
    })
    expect(persistenceFailure(error)).toMatchObject({
      kind: 'temporary',
      status: 503,
      code: 'ADVISORY_VERIFICATION_UNAVAILABLE',
      retryAfterMs: 24000,
    })
  })
  it.each([
    [402, 'subscription'],
    [403, 'access'],
    [503, 'temporary'],
  ])('distinguishes %s from subscription expiry', (status, kind) => {
    expect(persistenceFailure({ status, details: { canManageBilling: false } })).toMatchObject({
      kind,
      status,
      canManageBilling: false,
    })
  })
  it('rejects skipped and deferred prerequisites', () => {
    expect(() => requirePersistenceAcknowledgement({ status: 'skipped' })).toThrow()
    expect(() =>
      requirePersistenceAcknowledgement({
        status: 'deferred',
        failure: { kind: 'temporary', message: 'offline' },
      })
    ).toThrow('offline')
  })
})
